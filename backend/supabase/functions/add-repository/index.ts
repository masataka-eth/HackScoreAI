// Deno型定義の宣言
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

/**
 * リポジトリ追加Edge Function
 * 
 * 【役割と機能】
 * - 既存のハッカソンに新しいリポジトリを追加する
 * - リポジトリの評価ジョブをキューに投入
 * - 重複チェックや権限確認を含む安全な追加処理
 * 
 * 【リクエスト処理の流れ】
 * 1. ユーザー認証の確認
 * 2. ハッカソンIDとリポジトリ名のバリデーション
 * 3. データベース関数を使用したリポジトリ追加
 * 4. 新規ジョブIDを返却（フロントエンドでワーカー起動管理）
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

    // 【リクエストボディの解析】ハッカソンIDとリポジトリ名を取得
    const { hackathonId, repositoryName } = await req.json();

    // 必須パラメータのバリデーション
    if (!hackathonId || !repositoryName) {
      return new Response(
        JSON.stringify({
          error: "hackathonId and repositoryName are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `🔄 Adding repository ${repositoryName} to hackathon ${hackathonId} for user ${user.id}`
    );

    // 【データベース操作】ハッカソンへのリポジトリ追加とジョブキュー投入
    // データベース関数で重複チェック、権限確認、ジョブ作成を一括実行
    const { data, error: addError } = await supabase.rpc(
      "add_repository_to_hackathon",
      {
        p_hackathon_id: hackathonId,
        p_repository_name: repositoryName,
        p_user_id: user.id,
      }
    );

    // 【エラーハンドリング】リポジトリ追加失敗時の処理
    if (addError) {
      console.error("Failed to add repository:", addError);
      return new Response(
        JSON.stringify({
          error: "Failed to add repository",
          details: addError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✅ Repository added successfully: ${JSON.stringify(data)}`);

    // 【レスポンス形式】成功時のレスポンスを返す
    // 注意: ワーカー通知はここでは行わない（複数リポジトリ追加時の連続通知防止）
    // フロントエンドで全リポジトリ追加後にワーカー起動を管理
    return new Response(
      JSON.stringify({
        success: true,
        message: "Repository added successfully",
        newJobId: data,
        hackathonId,
        repositoryName,
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
