// Deno型定義の宣言
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

/**
 * ハッカソン削除Edge Function
 * 
 * 【役割と機能】
 * - ユーザーが作成したハッカソンを完全削除する
 * - 関連する評価結果とジョブを一括削除
 * - 権限確認による安全な削除処理
 * 
 * 【リクエスト処理の流れ】
 * 1. ユーザー認証の確認
 * 2. ハッカソンIDのバリデーション
 * 3. 権限確認（作成者のみ削除可能）
 * 4. データベース関数による一括削除処理
 */
import { serve } from "https://deno.land/std@0.184.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  // 【CORS処理】プリフライトリクエストの対応
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 【データベース初期化】サービスロールでSupabaseクライアントを作成
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 【認証・権限チェック】リクエストヘッダーからJWTトークンを取得
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 【ユーザー認証】JWTトークンからユーザー情報を検証
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    // 認証失敗時は401エラーを返す
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 【リクエストボディの解析】削除対象のハッカソンIDを取得
    const { hackathonId } = await req.json();

    // 必須パラメータのバリデーション
    if (!hackathonId) {
      return new Response(
        JSON.stringify({ error: "hackathonId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🗑️ Deleting hackathon ${hackathonId} for user ${user.id}`);

    // 【データベース操作】ハッカソンと関連データの一括削除
    // データベース関数で権限確認、評価結果、ジョブを含む一括削除
    const { data, error: deleteError } = await supabase.rpc(
      "delete_hackathon",
      {
        p_hackathon_id: hackathonId,
        p_user_id: user.id,
      }
    );

    // 【エラーハンドリング】ハッカソン削除失敗時の処理
    if (deleteError) {
      console.error("Failed to delete hackathon:", deleteError);
      return new Response(
        JSON.stringify({
          error: "Failed to delete hackathon",
          details: deleteError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✅ Hackathon deleted successfully`);

    // 【レスポンス形式】成功時のレスポンスを返す
    return new Response(
      JSON.stringify({
        success: true,
        message: "Hackathon deleted successfully",
        hackathonId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // 【エラーハンドリング】予期しないエラーの処理
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
