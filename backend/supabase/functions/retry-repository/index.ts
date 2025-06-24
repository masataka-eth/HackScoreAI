// Deno型定義の宣言
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

/**
 * リポジトリ再実行Edge Function
 * 
 * 【役割と機能】
 * - 失敗したリポジトリ評価を再実行する
 * - 新しいジョブをキューに投入し直す
 * - Cloud Run Workerに処理開始を通知
 * 
 * 【リクエスト処理の流れ】
 * 1. ユーザー認証の確認
 * 2. ハッカソンIDとリポジトリ名のバリデーション
 * 3. 権限確認と失敗ステータスの確認
 * 4. 新規ジョブ作成とキューへの投入
 * 5. Cloud Run Workerへの処理開始通知
 */
import { serve } from "https://deno.land/std@0.184.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header
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

    // Verify user from JWT
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { hackathonId, repositoryName } = await req.json();

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
      `🔄 Retrying repository ${repositoryName} in hackathon ${hackathonId} for user ${user.id}`
    );

    // Retry repository using database function
    const { data, error: retryError } = await supabase.rpc(
      "retry_failed_repository",
      {
        p_hackathon_id: hackathonId,
        p_repository_name: repositoryName,
        p_user_id: user.id,
      }
    );

    if (retryError) {
      console.error("Failed to retry repository:", retryError);
      return new Response(
        JSON.stringify({
          error: "Failed to retry repository",
          details: retryError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✅ Repository retry initiated successfully`);

    // 【外部サービス連携】Cloud Run Workerに再実行ジョブの処理開始を通知
    const cloudRunUrl = Deno.env.get("CLOUD_RUN_WORKER_URL");
    if (cloudRunUrl) {
      try {
        // Cloud Run Workerの/pollエンドポイントに再実行シグナルを送信
        const pingResponse = await fetch(`${cloudRunUrl}/poll`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("CLOUD_RUN_AUTH_TOKEN")}`,
            "Content-Type": "application/json",
          },
        });

        if (!pingResponse.ok) {
          console.error(`Worker ping failed: ${pingResponse.status}`);
        } else {
          console.log("✅ Worker pinged successfully");
        }
      } catch (pingError) {
        console.error("Failed to ping worker:", pingError);
        // Worker通知の失敗はリクエスト全体の失敗にはしない
      }
    }

    // 【レスポンス形式】成功時のレスポンスを返す
    return new Response(
      JSON.stringify({
        success: true,
        message: "Repository retry initiated successfully",
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
