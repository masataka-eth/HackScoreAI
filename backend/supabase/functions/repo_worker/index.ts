// Deno型定義の宣言
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

/**
 * リポジトリ処理ワーカーEdge Function
 * 
 * 【役割と機能】
 * - ジョブキューから評価ジョブを取得し、Cloud Run Workerに転送する
 * - ヘルスチェック機能とワーカープロセス状態の監視
 * - Cloud Run未対応時のフォールバック処理（基本的な評価結果生成）
 * 
 * 【リクエスト処理の流れ】
 * 1. GET: ワーカーのヘルスチェック（状態確認）
 * 2. POST: キューからジョブを取得し、Cloud Run Workerで並行処理
 * 3. Cloud Run失敗時: Edge Function内でフォールバック処理
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ワーカーの処理状態を管理するグローバル変数
let isProcessing = false;
let lastProcessTime = Date.now();

serve(async (req) => {
  // 【CORS処理】プリフライトリクエストの対応
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 【ヘルスチェック】ワーカーの動作状態と最終処理時刻を返す
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "repo_worker",
        isProcessing,
        lastProcessTime: new Date(lastProcessTime).toISOString(),
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  }

  // 【キュー処理エンドポイント】POSTリクエストでジョブ処理を開始
  if (req.method === "POST") {
    // 同時実行防止 - 既に処理中の場合は429エラーを返す
    if (isProcessing) {
      return new Response(
        JSON.stringify({
          message: "Worker is already processing",
          isProcessing: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 429,
        }
      );
    }

    // 処理状態を更新してデータベース接続を初期化
    isProcessing = true;
    lastProcessTime = Date.now();

    try {
      // 【データベース初期化】サービスロールでSupabaseクライアントを作成
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey =
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // 【外部サービス連携】Cloud Run Workerに全ジョブの一括処理を依頼
      console.log("🚀 Triggering Cloud Run Worker to poll and process all jobs...");
      
      const cloudRunUrl =
        Deno.env.get("CLOUD_RUN_WORKER_URL") || "http://host.docker.internal:8080";
      const authToken = Deno.env.get("CLOUD_RUN_AUTH_TOKEN") || "";

      try {
        // Cloud Run Workerのポーリングエンドポイントを呼び出し
        const response = await fetch(`${cloudRunUrl}/poll`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          throw new Error(
            `Cloud Run worker poll failed: ${response.status} ${response.statusText}`
          );
        }

        const result = await response.json();
        console.log("✅ Cloud Run Worker poll response:", result);
        
        // 【レスポンス形式】Cloud Run Workerの成功レスポンスを返す
        isProcessing = false;
        return new Response(
          JSON.stringify({
            success: true,
            message: "Cloud Run Worker polling triggered",
            result: result,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      } catch (pollError) {
        // 【エラーハンドリング】Cloud Run接続失敗時のフォールバック処理
        console.error("❌ Failed to trigger Cloud Run Worker poll:", pollError);
        
        // レガシーの単一メッセージ処理にフォールバック
        console.log("🔄 Falling back to single message processing...");
        
        return await processLegacySingleMessage(supabase);
      }
    } finally {
      isProcessing = false;
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 405,
  });
});

// 【フォールバック処理】Cloud Run未対応時のレガシー単一メッセージ処理
async function processLegacySingleMessage(supabase: any) {
  try {
    // 【キューからメッセージ取得】pgmqを使用して最初の1件を取得
    const { data: messages, error: readError } = await supabase.rpc(
      "pgmq_read",
      {
        queue_name: "repo_analysis_queue",
        visibility_timeout: 300, // 5分間の可視性タイムアウト
        qty: 1,
      }
    );

    // 【エラーハンドリング】キュー読み取り失敗時の処理
    if (readError) {
      console.error("Failed to read from queue:", readError);
      return new Response(
        JSON.stringify({
          error: "Failed to read from queue",
          details: readError,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // キューが空の場合の処理
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No messages in queue",
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const message = messages[0];
    console.log("Processing message:", message.msg_id, message.message);

    // 【データベース操作】ジョブステータスを「処理中」に更新
    await supabase
      .from("job_status")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("queue_message_id", message.msg_id);

    try {
      // 【Cloud Run連携】ジョブをCloud Runに転送（秘密鍵は送信せず）
      console.log("🚀 Starting Cloud Run processing (async)");

      // Cloud Runでの処理を非同期で開始（awaitしない）
      forwardToCloudRunWorker({
        ...message.message,
        // HTTP経由での秘密鍵送信は避け、Cloud Runで直接取得
        requiresSecrets: true,
      }).catch(async (error) => {
        console.error("❌ Cloud Run processing failed:", error);
        console.log("🔄 Attempting fallback processing within Edge Function");

        try {
          // 【フォールバック処理】Edge Function内で基本的な評価を実行
          await processFallback(message.message, supabase);
          console.log("✅ Fallback processing completed successfully");

          // フォールバック処理完了としてジョブステータスを更新
          await supabase
            .from("job_status")
            .update({
              status: "completed",
              result: {
                fallback: true,
                message:
                  "Processed within Edge Function due to Cloud Run connectivity issues",
              },
              updated_at: new Date().toISOString(),
            })
            .eq("queue_message_id", message.msg_id);
        } catch (fallbackError) {
          // フォールバック処理も失敗した場合のエラー処理
          console.error("❌ Fallback processing also failed:", fallbackError);
          // ジョブステータスを失敗に更新
          await supabase
            .from("job_status")
            .update({
              status: "failed",
              error: `Cloud Run failed: ${error.message}. Fallback failed: ${fallbackError.message}`,
              updated_at: new Date().toISOString(),
            })
            .eq("queue_message_id", message.msg_id);
        }
      });

      // 【レスポンス処理】Cloud Runに転送成功で即座レスポンス
      const result = {
        success: true,
        message: "Job forwarded to Cloud Run worker",
        cloudRunProcessing: true,
      };

      // ジョブステータスを完了に更新（Cloud Runでの処理結果は別途更新）
      await supabase
        .from("job_status")
        .update({
          status: "completed",
          result: result,
          updated_at: new Date().toISOString(),
        })
        .eq("queue_message_id", message.msg_id);

      // 【キュークリーンアップ】処理済みメッセージをキューから削除
      await supabase.rpc("pgmq_delete", {
        queue_name: "repo_analysis_queue",
        msg_id: message.msg_id,
      });

      return new Response(
        JSON.stringify({
          success: true,
          messageId: message.msg_id,
          result: result,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } catch (processError) {
      // 【エラーハンドリング】処理中のエラー対応
      console.error("Processing error:", processError);

      // ジョブステータスを失敗に更新
      await supabase
        .from("job_status")
        .update({
          status: "failed",
          error:
            processError instanceof Error
              ? processError.message
              : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("queue_message_id", message.msg_id);

      // 失敗メッセージをアーカイブに移動
      await supabase.rpc("pgmq_archive", {
        queue_name: "repo_analysis_queue",
        msg_id: message.msg_id,
      });

      return new Response(
        JSON.stringify({
          error: "Processing failed",
          messageId: message.msg_id,
          details:
            processError instanceof Error
              ? processError.message
              : "Unknown error",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }
  } catch (error) {
    console.error("Legacy processing error:", error);
    return new Response(
      JSON.stringify({
        error: "Legacy processing failed",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}

// 【Cloud Run連携関数】ジョブをCloud Run Workerに転送
async function forwardToCloudRunWorker(jobPayload: any) {
  const cloudRunUrl =
    Deno.env.get("CLOUD_RUN_WORKER_URL") || "http://host.docker.internal:8080";
  const authToken = Deno.env.get("CLOUD_RUN_AUTH_TOKEN") || "";

  console.log("🚀 Forwarding job to Cloud Run worker:", cloudRunUrl);
  console.log("🔑 Auth token available:", authToken ? "Yes" : "No");
  console.log("📦 Payload:", JSON.stringify(jobPayload, null, 2));

  try {
    // Cloud Run Workerの/processエンドポイントにジョブペイロードを送信
    const response = await fetch(`${cloudRunUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(jobPayload),
    });

    if (!response.ok) {
      throw new Error(
        `Cloud Run worker failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    // 接続エラーの詳細情報をログ出力
    console.error("❌ Fetch error details:", error);
    console.error("❌ Cloud Run URL:", cloudRunUrl);
    console.error("❌ Auth token length:", authToken.length);
    throw error;
  }
}

// 【フォールバック処理関数】Cloud Runが利用不可時の基本評価生成
async function processFallback(jobPayload: any, supabaseClient: any) {
  console.log("🔄 Starting fallback processing for job:", jobPayload.jobId);

  // シンプルなフォールバック: 各リポジトリに基本的な評価結果を作成
  const repositories = jobPayload.repositories || [];
  const userId = jobPayload.userId;
  const jobId = jobPayload.jobId;

  for (const repository of repositories) {
    console.log(
      `📝 Creating fallback evaluation for repository: ${repository}`
    );

    // 【データベース操作】基本的な評価結果を挿入
    const { error: insertError } = await supabaseClient
      .from("evaluation_results")
      .insert({
        id: crypto.randomUUID(),
        job_id: jobId,
        user_id: userId,
        repository_name: repository,
        total_score: 50, // デフォルトのフォールバックスコア
        evaluation_data: {
          totalScore: 50,
          items: [
            {
              id: "fallback",
              name: "Fallback Evaluation",
              score: 50,
              max_score: 100,
              positives:
                "Repository registered successfully. Detailed analysis was not available due to technical limitations.",
              negatives:
                "Full analysis could not be completed. Please retry for detailed evaluation.",
            },
          ],
          overallComment:
            "This is a fallback evaluation created when the main analysis system was unavailable. The repository has been registered and can be re-analyzed later for detailed insights.",
        },
        status: "completed",
        processing_metadata: {
          fallback: true,
          processed_at: new Date().toISOString(),
          method: "edge_function_fallback",
        },
      });

    // エラーハンドリング: フォールバック評価の挿入失敗
    if (insertError) {
      console.error(
        `❌ Failed to insert fallback evaluation for ${repository}:`,
        insertError
      );
      throw insertError;
    }

    console.log(`✅ Fallback evaluation created for ${repository}`);
  }

  console.log("✅ Fallback processing completed for all repositories");
}