// Deno型定義の宣言
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

/**
 * ジョブキューへの投入Edge Function
 * 
 * 【役割と機能】
 * - ハッカソン評価のための新規ジョブをキューに投入する
 * - リポジトリリストと評価基準を受け取り、ハッカソンを作成
 * - Cloud Run Workerにジョブ処理開始の通知を送信
 * 
 * 【リクエスト処理の流れ】
 * 1. CORSプリフライトリクエストの処理
 * 2. 認証トークンの検証
 * 3. リクエストボディの解析・バリデーション
 * 4. ハッカソンの作成とリポジトリの登録
 * 5. Cloud Run Workerへの処理開始通知
 */
import { serve } from "https://deno.land/std@0.184.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  console.log("📨 Enqueue function called", {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
  });

  // 【CORS処理】プリフライトリクエストの対応
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 【データベース初期化】管理者権限でSupabaseクライアントを作成
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    console.log("🔧 Supabase URL:", supabaseUrl);

    // サービスロールキーを使用して全権限でデータベースにアクセス
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 【認証・権限チェック】リクエストヘッダーからJWTトークンを取得
    const authHeader = req.headers.get("Authorization");
    console.log("🔐 Auth header:", authHeader?.substring(0, 50) + "...");

    // 認証ヘッダーが存在しない場合は401エラーを返す
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 【リクエストボディの解析】評価対象リポジトリと評価基準を取得
    const { repositories, evaluationCriteria, userId } = await req.json();

    // リポジトリリストの必須チェック - 配列形式で1つ以上必要
    if (
      !repositories ||
      !Array.isArray(repositories) ||
      repositories.length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "Repositories array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 【ユーザー認証】JWTトークンからユーザー情報を検証
    const token = authHeader.replace("Bearer ", "");

    // ユーザートークンを使用したSupabaseクライアントで認証状態を確認
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // JWTトークンの有効性とユーザー情報を取得
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    console.log("👤 Auth result:", {
      user: user ? { id: user.id, email: user.email } : null,
      error: authError,
    });

    // 認証失敗時の処理 - フォールバック対応あり
    if (authError || !user) {
      console.error("❌ Auth failed:", authError);
      // リクエストボディにuserIdが含まれている場合はフォールバックとして使用
      if (userId) {
        console.log("⚠️ Using userId from request body as fallback:", userId);
      } else {
        return new Response(
          JSON.stringify({
            error: "Invalid token",
            details: authError?.message,
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const actualUserId = user?.id || userId;
    console.log("✅ Using userId:", actualUserId);

    const hackathonName =
      evaluationCriteria?.hackathonName ||
      `ハッカソン ${new Date().toLocaleDateString("ja-JP")}`;

    console.log(
      `📝 Creating hackathon "${hackathonName}" for user ${actualUserId} with ${repositories.length} repositories`
    );

    // 【データベース操作】ハッカソンとリポジトリジョブを一括作成
    // データベース関数を使用してハッカソン作成とキューへのジョブ投入を実行
    const { data: hackathonId, error: createError } = await supabaseAdmin.rpc(
      "create_hackathon",
      {
        p_name: hackathonName,
        p_user_id: actualUserId,
        p_repositories: repositories,
        p_metadata: {
          evaluationCriteria: evaluationCriteria || {},
        },
      }
    );

    // 【エラーハンドリング】ハッカソン作成失敗時の処理
    if (createError) {
      console.error("Failed to create hackathon:", createError);
      return new Response(
        JSON.stringify({
          error: "Failed to create hackathon",
          details: createError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✅ Hackathon created with ID: ${hackathonId}`);

    // 【外部サービス連携】Cloud Run Workerにジョブ処理開始を通知
    const cloudRunUrl = Deno.env.get("CLOUD_RUN_WORKER_URL");
    if (cloudRunUrl) {
      try {
        // Cloud Run Workerの/pollエンドポイントに処理開始シグナルを送信
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
    // ハッカソンID、処理対象リポジトリ数、リポジトリリストを含む
    return new Response(
      JSON.stringify({
        success: true,
        hackathonId,
        message: `Hackathon created with ${repositories.length} repositories`,
        repositories,
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
