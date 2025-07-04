/**
 * HackScore AI - GitHub Repository Analysis Worker
 *
 * A high-performance worker service that analyzes GitHub repositories using Claude Code SDK
 * and evaluates them based on hackathon criteria. This worker processes jobs from a
 * Supabase pgmq queue and provides comprehensive repository analysis.
 *
 * Features:
 * - Queue-based job processing with Supabase pgmq
 * - GitHub repository analysis using Claude Code SDK with MCP (Model Context Protocol)
 * - Hackathon-specific evaluation criteria scoring
 * - Secure credential management via Supabase Vault
 * - Production-ready deployment for Cloud Run and Compute Engine
 * - Comprehensive logging and error handling
 * - RESTful API endpoints for health checks and manual processing
 *
 * @author HackScore AI Team
 * @version 1.0.0
 * @license MIT
 */

import express from "express";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// Initialize Express application
// Serves as the main HTTP server for processing repository analysis jobs
const app = express();
app.use(express.json()); // Parse JSON request bodies

// Environment variables validation
// These are required for the worker to function properly
const requiredEnvVars = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUD_RUN_AUTH_TOKEN",
];

// Validate all required environment variables are present
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Application configuration from environment variables
// Centralized configuration management for better maintainability
const config = {
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  server: {
    port: parseInt(process.env.PORT) || 8080,
    nodeEnv: process.env.NODE_ENV || "development",
  },
  auth: {
    token: process.env.CLOUD_RUN_AUTH_TOKEN,
  },
  processing: {
    maxTurns: parseInt(process.env.MAX_TURNS_PER_ANALYSIS) || 50,
    timeoutMs: parseInt(process.env.ANALYSIS_TIMEOUT_MS) || 3300000,
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
  cost: {
    estimatedCostPerToken:
      parseFloat(process.env.ESTIMATED_COST_PER_TOKEN) || 0.000003,
  },
};

// Initialize Supabase client with service role key
// Used for database operations and pgmq queue management
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

/**
 * Authentication middleware for protected endpoints
 * Validates Bearer token against configured auth token
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
const authenticateRequest = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1]; // Extract Bearer token

  if (!token || token !== config.auth.token) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  next();
};

/**
 * Health check endpoint (No authentication required)
 * Used by load balancers and monitoring systems to verify service health
 *
 * @route GET /health
 * @returns {Object} Service health status and configuration
 */
app.get("/health", (req, res) => {
  console.log(`🏥 Health check request received from ${req.ip}`);
  res.json({
    status: "ok",
    service: "claudecode-worker",
    version: "1.0.0",
    environment: config.server.nodeEnv,
    timestamp: new Date().toISOString(),
    config: {
      maxTurns: config.processing.maxTurns,
      timeoutMs: config.processing.timeoutMs,
    },
  });
});

/**
 * Simple test endpoint for basic connectivity verification
 *
 * @route GET /test
 * @returns {String} Simple greeting message
 */
app.get("/test", (req, res) => {
  console.log(`🧪 Test request received from ${req.ip}`);
  res.send("Hello from Cloud Run Worker!");
});

/**
 * Single repository processing endpoint (Authentication required)
 * Processes a single GitHub repository analysis job
 * Called by frontend or internal polling system
 *
 * @route POST /process
 * @param {Object} req.body - Job details including repository, userId, evaluationCriteria, jobId, hackathonId
 * @returns {Object} Processing result with success status and evaluation data
 */
app.post("/process", authenticateRequest, async (req, res) => {
  try {
    console.log("🔍 Request body received:", JSON.stringify(req.body, null, 2));
    const { repository, userId, evaluationCriteria, jobId, hackathonId } =
      req.body;

    console.log(
      `🔍 Processing job ${jobId} for hackathon ${hackathonId} with repository:`,
      repository
    );

    // Ensure job status record exists in database
    await ensureJobStatus(jobId, userId, { ...req.body, hackathonId });

    // Retrieve user credentials from Supabase Vault
    const secrets = await getUserSecrets(userId);

    console.log(`🔑 Retrieved secrets from Vault for user: ${userId}`);
    console.log(`🔑 Anthropic Key available: ${!!secrets.anthropicKey}`);
    console.log(`🔑 GitHub Token available: ${!!secrets.githubToken}`);

    // Process repository using Claude Code SDK
    const result = await processRepositoryWithClaudeCode(
      repository,
      secrets,
      evaluationCriteria
    );

    // Save evaluation results to database if processing succeeded
    if (result.success) {
      try {
        console.log(`💾 Saving evaluation result for ${repository}...`);
        console.log(`💾 Job ID: ${jobId}, User ID: ${userId}`);
        console.log(
          `💾 Evaluation data:`,
          JSON.stringify(result.evaluation, null, 2)
        );

        // Store evaluation results in Supabase
        const saveResult = await saveEvaluationResult(
          jobId,
          userId,
          repository,
          result.evaluation,
          result.metadata
        );

        console.log(
          `✅ Successfully saved evaluation result for ${repository}:`,
          saveResult
        );
      } catch (saveError) {
        console.error(
          `❌ Failed to save evaluation result for ${repository}:`,
          saveError
        );
        console.error(
          `❌ Save error details:`,
          saveError.message,
          saveError.stack
        );
        result.success = false;
        result.error = `Failed to save evaluation: ${saveError.message}`;
      }
    }

    // Update job status in database
    const status = result.success ? "completed" : "failed";
    console.log(`📝 Updating job status to "${status}" for job ${jobId}...`);

    try {
      await updateJobStatus(jobId, status, {
        repository,
        success: result.success,
        error: result.error,
        totalScore: result.evaluation?.totalScore,
      });
      console.log(
        `✅ Successfully updated job status to "${status}" for job ${jobId}`
      );
    } catch (statusError) {
      console.error(
        `❌ Failed to update job status for ${jobId}:`,
        statusError
      );
      console.error(
        `❌ Status error details:`,
        statusError.message,
        statusError.stack
      );
    }

    // Return processing results
    res.json({
      success: true,
      jobId,
      hackathonId,
      repository,
      result: {
        success: result.success,
        error: result.error,
        totalScore: result.evaluation?.totalScore,
      },
    });
  } catch (error) {
    console.error("Error processing job:", error);

    // Update job status to failed if jobId is available
    if (req.body.jobId) {
      await updateJobStatus(req.body.jobId, "failed", { error: error.message });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Queue polling endpoint for continuous job processing (Authentication required)
 * Continuously polls Supabase pgmq queue for pending analysis jobs
 * Typically called by Google Cloud Scheduler or similar cron systems
 *
 * @route POST /poll
 * @returns {Object} Summary of processed jobs including count and status
 */
app.post("/poll", authenticateRequest, async (req, res) => {
  try {
    console.log("📥 Starting continuous polling for jobs...");
    let processedCount = 0;
    let processedJobs = [];
    let hasErrors = false;
    let lastError = null;

    // Log initial queue state for monitoring
    const { data: initialQueueStats } = await supabase.rpc("pgmq_metrics", {
      queue_name: "repo_analysis_queue",
    });
    console.log("📊 Initial queue state:", initialQueueStats);

    // Main polling loop - processes jobs until queue is empty
    while (true) {
      console.log(`🔄 Polling iteration ${processedCount + 1}...`);

      // Read message from pgmq queue with extended visibility timeout
      console.log("🔍 Reading from pgmq queue with params:", {
        queue_name: "repo_analysis_queue",
        visibility_timeout: 3600, // 60 minutes for long-running analysis
        qty: 1,
      });

      const { data: messages, error } = await supabase.rpc("pgmq_read", {
        queue_name: "repo_analysis_queue",
        visibility_timeout: 3600, // Extended timeout for comprehensive analysis
        qty: 1,
      });

      console.log("🔍 Queue read result:", {
        messages: messages ? messages.length : 0,
        error: error?.message || null,
        firstMessageId:
          messages && messages.length > 0 ? messages[0].msg_id : null,
      });

      // Handle queue read errors
      if (error) {
        console.error("❌ Queue read error details:", error);
        hasErrors = true;
        lastError = `Queue read error: ${error.message}`;
        break;
      }

      // Exit loop if no more messages in queue
      if (!messages || messages.length === 0) {
        console.log(
          `ℹ️ No more messages in queue - processed ${processedCount} jobs total`
        );

        // Log final queue metrics for monitoring
        const { data: finalQueueStats } = await supabase.rpc("pgmq_metrics", {
          queue_name: "repo_analysis_queue",
        });
        console.log("📊 Final queue state:", finalQueueStats);
        break;
      }

      // Process the received message
      const message = messages[0];
      console.log("📨 Processing message:", message.msg_id);
      console.log(
        "🔍 Message content:",
        JSON.stringify(message.message, null, 2)
      );

      // Update job status to processing
      await updateJobStatus(message.message.jobId, "processing");

      let messageHandled = false;

      try {
        // Process the job by calling internal /process endpoint
        console.log(
          `🚀 Starting processing for job ${message.message.jobId}...`
        );

        // Set up timeout controller for long-running jobs
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, config.processing.timeoutMs + 300000); // Processing timeout + 5 minute buffer

        try {
          // Make internal HTTP request to process endpoint
          const processResult = await fetch(
            `http://localhost:${config.server.port}/process`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.auth.token}`,
              },
              body: JSON.stringify(message.message),
              signal: controller.signal,
            }
          );

          clearTimeout(timeout); // Clear timeout on completion

          if (processResult.ok) {
            console.log(
              `✅ Job ${message.message.jobId} processing completed successfully`
            );

            // Delete processed message from queue
            console.log(`🗑️ Deleting message ${message.msg_id} from queue...`);
            const { data: deleteResult, error: deleteError } =
              await supabase.rpc("pgmq_delete", {
                queue_name: "repo_analysis_queue",
                msg_id: message.msg_id,
              });

            if (deleteError) {
              console.error(
                `❌ Failed to delete message ${message.msg_id}:`,
                deleteError
              );
              hasErrors = true;
              lastError = `Delete failed: ${deleteError.message}`;
            } else {
              console.log(
                `✅ Successfully deleted message ${message.msg_id}, result:`,
                deleteResult
              );
              messageHandled = true;
            }

            console.log(
              `✅ Successfully processed job ${message.message.jobId}`
            );
            processedJobs.push({
              messageId: message.msg_id,
              jobId: message.message.jobId,
              deleted: !deleteError,
            });
            processedCount++;
          } else {
            // Handle processing failure
            const errorText = await processResult.text();
            console.error(
              `❌ Job ${message.message.jobId} processing failed with status: ${processResult.status}, response: ${errorText}`
            );

            // Update job status to failed
            await updateJobStatus(message.message.jobId, "failed", {
              error: `Process endpoint returned status ${processResult.status}: ${errorText}`,
            });

            // Archive failed message for later analysis
            console.log(`📦 Archiving failed message ${message.msg_id}...`);
            const { data: archiveResult, error: archiveError } =
              await supabase.rpc("pgmq_archive", {
                queue_name: "repo_analysis_queue",
                msg_id: message.msg_id,
              });

            if (archiveError) {
              console.error(
                `❌ Failed to archive message ${message.msg_id}:`,
                archiveError
              );
            } else {
              console.log(
                `✅ Successfully archived message ${message.msg_id}, result:`,
                archiveResult
              );
              messageHandled = true;
            }

            hasErrors = true;
            lastError = `Process failed with status: ${processResult.status}`;
          }
        } catch (processError) {
          clearTimeout(timeout); // Clear timeout on exception

          console.error(
            `❌ Job ${message.message.jobId} processing exception:`,
            processError
          );

          // Update job status to failed
          await updateJobStatus(message.message.jobId, "failed", {
            error: processError.message || "Unknown processing error",
          });

          // Archive message that caused exception
          console.log(`📦 Archiving exception message ${message.msg_id}...`);
          const { data: archiveResult, error: archiveError } =
            await supabase.rpc("pgmq_archive", {
              queue_name: "repo_analysis_queue",
              msg_id: message.msg_id,
            });

          if (archiveError) {
            console.error(
              `❌ Failed to archive message ${message.msg_id}:`,
              archiveError
            );
          } else {
            console.log(
              `✅ Successfully archived message ${message.msg_id}, result:`,
              archiveResult
            );
            messageHandled = true;
          }

          hasErrors = true;
          lastError = processError.message;
        }
      } catch (outerError) {
        console.error(
          `❌ Outer processing error for job ${message.message.jobId}:`,
          outerError
        );
        hasErrors = true;
        lastError = outerError.message;

        // Attempt to update job status even on outer errors
        try {
          await updateJobStatus(message.message.jobId, "failed", {
            error: outerError.message || "Unknown outer processing error",
          });
        } catch (statusError) {
          console.error(
            "Failed to update job status on outer error:",
            statusError
          );
        }
      }

      // Prevent infinite loops by ensuring message was handled
      if (!messageHandled) {
        console.error(
          `⚠️ Message ${message.msg_id} was not properly handled (not deleted or archived), breaking to avoid infinite loop`
        );
        hasErrors = true;
        lastError = `Message ${message.msg_id} handling failed`;
        break;
      }

      // Log queue state after processing for monitoring
      const { data: midQueueStats } = await supabase.rpc("pgmq_metrics", {
        queue_name: "repo_analysis_queue",
      });
      console.log(
        `📊 Queue state after processing job ${message.message.jobId}:`,
        midQueueStats
      );

      // Small delay between processing jobs to prevent overwhelming
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Return comprehensive summary of polling session
    const response = {
      success: true,
      processedCount,
      processedJobs,
      hasErrors,
      lastError,
      message:
        processedCount === 0
          ? "No jobs in queue"
          : `Processed ${processedCount} jobs from queue`,
    };

    console.log("📊 Polling session completed:", response);
    res.json(response);
  } catch (error) {
    console.error("Polling error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * ユーザーのシークレット情報取得
 *
 * Supabase Vaultからユーザーの認証情報を安全に取得
 * - Anthropic API Key: Claude Code SDK用
 * - GitHub Token: GitHub MCP用
 *
 * @param {string} userId - ユーザーID
 * @returns {Object} secrets - ユーザーの認証情報
 */
async function getUserSecrets(userId) {
  console.log(`🔑 Retrieving secrets for user: ${userId}`);

  const { data: anthropicKey, error: anthropicError } = await supabase.rpc(
    "get_secret_for_job",
    {
      p_user_id: userId,
      p_secret_type: "anthropic_key",
    }
  );

  if (anthropicError) {
    console.error("❌ Failed to retrieve Anthropic API key:", anthropicError);
    throw new Error(
      `Failed to retrieve Anthropic API key: ${anthropicError.message}`
    );
  }

  if (!anthropicKey) {
    console.error("❌ Anthropic API key not found for user:", userId);
    throw new Error(
      "Anthropic API key not found. Please save your key in the settings page."
    );
  }

  // Log partial key for debugging (first 10 chars only)
  console.log(
    `✅ Anthropic API key retrieved: ${anthropicKey.substring(0, 10)}...`
  );

  const { data: githubToken, error: githubError } = await supabase.rpc(
    "get_secret_for_job",
    {
      p_user_id: userId,
      p_secret_type: "github_token",
    }
  );

  if (githubError) {
    console.error("❌ Failed to retrieve GitHub token:", githubError);
    throw new Error(`Failed to retrieve GitHub token: ${githubError.message}`);
  }

  return { anthropicKey, githubToken };
}

/**
 * Claude Code SDKを使用したリポジトリ解析・評価処理
 *
 * このメソッドはHackScoreAIの中核となる評価ロジックです。
 * Claude Code SDKとGitHub MCPを連携させて以下の流れで処理します：
 *
 * 1. GitHub MCPを使用してリポジトリ構造・ファイル取得
 * 2. Claude Code SDKでコード解析・評価プロンプト実行
 * 3. ハッカソン評価基準に基づくスコアリング
 * 4. JSON形式での評価結果取得・バリデーション
 *
 * @param {string} repoName - GitHubリポジトリ名（owner/repo形式）
 * @param {Object} secrets - ユーザーの認証情報
 * @param {Object} evaluationCriteria - 評価基準（現在未使用、将来拡張予定）
 * @returns {Object} 評価結果オブジェクト
 */
async function processRepositoryWithClaudeCode(
  repoName,
  secrets,
  evaluationCriteria
) {
  let timeoutId;

  try {
    console.log(`🔍 Analyzing repository: ${repoName}`);

    // Claude Code用の解析プロンプト生成
    // simple版は4項目評価（市場優位性、技術力、完成度、ユーザビリティ）
    const prompt = buildAnalysisPrompt_simple(repoName, evaluationCriteria);
    const abortController = new AbortController();

    // タイムアウト設定
    timeoutId = setTimeout(() => {
      console.log(`⏰ Analysis timeout for ${repoName}, aborting...`);
      abortController.abort();
    }, config.processing.timeoutMs);

    // Validate API key before proceeding
    if (!secrets.anthropicKey) {
      throw new Error("Anthropic API key is missing");
    }

    console.log(
      `🔐 Using API key: ${secrets.anthropicKey.substring(
        0,
        10
      )}... for Claude Code`
    );

    // CloudRun環境での動的インポート解決:
    // ユーザーのAPIキーとGitHubトークンを環境変数に設定してから、Claude Code SDKを動的にインポート
    process.env.ANTHROPIC_API_KEY = secrets.anthropicKey;
    process.env.GITHUB_TOKEN = secrets.githubToken;
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = secrets.githubToken;
    console.log(
      `🔒 Set ANTHROPIC_API_KEY environment variable for Claude Code`
    );
    console.log(`🔒 Set GITHUB_TOKEN environment variable for GitHub MCP`);

    // Claude Code SDKを動的にインポート（環境変数設定後）
    console.log(`📦 Dynamically importing Claude Code SDK...`);
    const { query } = await import("@anthropic-ai/claude-code");
    console.log(`✅ Claude Code SDK imported successfully`);

    // 🚀 Claude Code SDK 実行
    console.log(`🚀 Starting Claude Code SDK analysis...`);
    console.log(`🔍 Prompt length: ${prompt.length}`);
    console.log(`🔍 Max turns: ${config.processing.maxTurns}`);
    console.log(
      `🔍 GitHub Token for MCP: ${secrets.githubToken?.substring(0, 10)}...`
    );
    console.log(`🔍 Repository being analyzed: ${repoName}`);

    let evaluationResult = null;
    let numTurns = 0;
    let totalCostUsd = 0;

    try {
      // Claude Code SDKを直接実行
      const messages = [];

      for await (const message of query({
        prompt,
        options: {
          maxTurns: config.processing.maxTurns,
          permissionMode: "bypassPermissions", // ★ 非対話環境では必須
          mcpServers: {
            github: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              env: {
                GITHUB_TOKEN: secrets.githubToken, // ★ ここを戻す
                GITHUB_PERSONAL_ACCESS_TOKEN: secrets.githubToken, //   片方だけでも OK
              },
              /* 公式ホスト。環境変数に URL を持たせても OK */
              // url: "https://api.githubcopilot.com/mcp/github",
              // authorization_token: secrets.githubToken, // PAT をそのままヘッダに付ける
            },
          },
          allowedTools: [
            "mcp__github__get_file_contents",
            "mcp__github__search_repositories",
            "mcp__github__search_code",
            "mcp__github__list_commits",
            "mcp__github__get_repository_structure",
            "mcp__github__list_repository_contents",
          ],
        },
      })) {
        console.log(`\n📝 ===== Turn ${numTurns + 1}: ${message.type} =====`);
        messages.push(message);

        if (message.type === "assistant") {
          numTurns++;

          // Claude Code レスポンスからテキスト抽出と詳細ログ
          let contentText = "";
          if (typeof message.message?.content === "string") {
            contentText = message.message.content;
            console.log(
              `💬 Assistant response (string): ${contentText.substring(
                0,
                200
              )}...`
            );
          } else if (Array.isArray(message.message?.content)) {
            // コンテンツの詳細を解析
            for (const item of message.message.content) {
              if (item.type === "text") {
                contentText += item.text;
                console.log(
                  `💬 Assistant text: ${item.text.substring(0, 200)}...`
                );
              } else if (item.type === "tool_use") {
                console.log(`🔧 MCP Tool Call: ${item.name}`);
                console.log(`   Tool ID: ${item.id}`);
                console.log(
                  `   Parameters: ${JSON.stringify(item.input, null, 2)}`
                );

                // GitHubファイル参照の詳細ログ
                if (item.name === "mcp__github__get_file_contents") {
                  console.log(`   📄 File: ${item.input.path || "N/A"}`);
                  console.log(
                    `   📦 Repository: ${item.input.repository || "N/A"}`
                  );
                } else if (item.name === "mcp__github__search_code") {
                  console.log(
                    `   🔍 Search Query: ${item.input.query || "N/A"}`
                  );
                  console.log(
                    `   📦 Repository: ${item.input.repository || "N/A"}`
                  );
                } else if (
                  item.name === "mcp__github__list_repository_contents"
                ) {
                  console.log(`   📁 Path: ${item.input.path || "/"}`);
                  console.log(
                    `   📦 Repository: ${item.input.repository || "N/A"}`
                  );
                }
              }
            }
          }

          // 評価結果JSON抽出・バリデーション
          const extractedJson = extractJsonFromText(contentText);
          if (extractedJson && validateEvaluationResult(extractedJson)) {
            evaluationResult = extractedJson;
            console.log("✅ Valid evaluation result JSON detected");
          }
        } else if (message.type === "user") {
          // ユーザーメッセージ（ツール結果など）の詳細ログ
          if (Array.isArray(message.message?.content)) {
            for (const item of message.message.content) {
              if (item.type === "tool_result") {
                console.log(`🔨 Tool Result - ID: ${item.tool_use_id}`);

                // エラーチェック
                if (item.is_error) {
                  console.error(`❌ MCP Tool Error: ${item.content}`);
                } else {
                  if (typeof item.content === "string") {
                    console.log(
                      `   Result (first 500 chars): ${item.content.substring(
                        0,
                        500
                      )}...`
                    );
                  } else if (Array.isArray(item.content)) {
                    for (const contentItem of item.content) {
                      if (contentItem.type === "text") {
                        console.log(
                          `   Result text: ${contentItem.text.substring(
                            0,
                            500
                          )}...`
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        } else if (message.type === "result") {
          if (message.subtype === "success") {
            numTurns = message.num_turns || numTurns;
            totalCostUsd = message.total_cost_usd || 0;
            console.log(
              `📊 Analysis completed - Turns: ${numTurns}, Cost: $${totalCostUsd.toFixed(
                4
              )}`
            );
          }
          break;
        }
      }
    } catch (error) {
      throw error;
    }

    // タイムアウトをクリア
    clearTimeout(timeoutId);

    if (!evaluationResult) {
      throw new Error("No valid evaluation result found");
    }

    return {
      success: true,
      evaluation: evaluationResult,
      metadata: { numTurns, totalCostUsd },
    };
  } catch (error) {
    console.error(`❌ Error analyzing ${repoName}:`, error);

    // エラーハンドリング・ログ出力
    // Claude Code SDKプロセス終了エラーの詳細分析
    // Claude Code process exit error
    if (error.message.includes("exited with code 1")) {
      console.error("❌ Claude Code process failed. Common causes:");
      console.error("  - Invalid or missing Anthropic API key");
      console.error("  - API key doesn't have Claude Code access");
      console.error("  - Network connectivity issues");
      return {
        success: false,
        error:
          "Claude Code process failed. Please check: 1) Your Anthropic API key is valid and saved in settings, 2) Your API key has Claude Code access, 3) Network connectivity",
      };
    }

    // エラーコード143の場合は特別な処理
    if (error.message.includes("exited with code 143")) {
      console.log(
        `⚠️  Repository ${repoName} analysis was terminated (possibly due to timeout)`
      );
      return {
        success: false,
        error:
          "Analysis timed out or was terminated. Try reducing MAX_TURNS_PER_ANALYSIS or increasing ANALYSIS_TIMEOUT_MS.",
      };
    }

    return {
      success: false,
      error: error.message,
    };
  } finally {
    // 必ずタイムアウトをクリア
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function buildAnalysisPrompt(repoName, evaluationCriteria) {
  return `
GitHub MCP を使用して、GitHub リポジトリ "${repoName}" を詳細に分析してください。必ず実際にファイルの内容を確認してから分析してください。

[IMPORTANT]
可能な限り少ないターン数で分析を行うために、工夫をしてください。
必ず主要なファイルを見極めることでコンテンツ取得のターン数を減らしてください。
ただし、**分析結果の精度は落としてはいけません**ので、主要なファイルを見極めは慎重に行ってください。

**利用可能なツール:**
- mcp__github__get_file_contents: ファイルの内容を取得
- mcp__github__search_repositories: リポジトリを検索
- mcp__github__search_code: コードを検索
- mcp__github__list_commits: コミット履歴を取得
- mcp__github__get_repository_structure: リポジトリの構造を取得
- mcp__github__list_repository_contents: リポジトリの内容を取得

**分析手順:**
1. リポジトリの基本構造を取得して、どのディレクトリが重要かを判断
2. README、package.json、requirements.txt等の設定ファイルを確認
3. src/, lib/, app/等のメインディレクトリの主要なファイル一覧を取得
4. 主要なソースコードファイルの内容を読み取り
5. 評価する

**出力形式（日本語で回答）:**

{
  "totalScore": 18,                // 0-20 の整数
  "items": [
    {
      "id": "1",
      "name": "テーマ適合度",        // 評価項目ラベル
      "score": 4,                  // 整数（配分内 0-5）
      "positives": "...",        // 良かった点 (1-3 件をわかりやすい文章で記載)
      "negatives": "..."         // 改善点 (1-3 件をわかりやすい文章で記載)
    },
    ...
    {
      "id": "7",
      "name": "ドキュメント",
      "score": 2,
      "positives": "...",
      "negatives": "..."
    }
  ],
  "overallComment": "総合的に見ると..." // 総合的に見てどうだったかをわかりやすい文章で記載、ここは長文となってもいいので詳細に記載してください。
}

## 評価項目
### 評価項目\_1
テーマ適合度
#### 配分
5 点
#### 主な評価軸
与えられたテーマや課題に対してどれだけ的確に応えているか

### 評価項目\_2
独創性・革新性
#### 配分
5 点
#### 主な評価軸
既存の解決策との差別化、新奇性、アイデアの意外性

### 評価項目\_3
技術的完成度
#### 配分
5 点
#### 主な評価軸
コード品質、技術スタックの妥当性、アルゴリズム／アーキテクチャの洗練度

### 評価項目\_4
機能実装・完成度
#### 配分
5 点
#### 主な評価軸
実際に「動く」かどうか、主要機能が一通り実装されているか

### 評価項目\_5
ユーザー体験（UX/UI）
#### 配分
5 点
#### 主な評価軸
直感的な操作性、デザインの一貫性、アクセシビリティ

### 評価項目\_6
実世界インパクト／ビジネス価値
#### 配分
5 点
#### 主な評価軸
社会的意義、市場規模、収益モデルの説得力

### 評価項目\_7
ドキュメント
#### 配分
5 点
#### 主な評価軸
README や API ドキュメントの充実度
`;
}

function buildAnalysisPrompt_simple(repoName, evaluationCriteria) {
  return `
GitHub MCP を使用して、GitHub リポジトリ "${repoName}" を詳細に分析してください。必ず実際にファイルの内容を確認してから分析してください。

[IMPORTANT]
可能な限り少ないターン数で分析を行うために、工夫をしてください。
必ず主要なファイルを見極めることでコンテンツ取得のターン数を減らしてください。
ただし、**分析結果の精度は落としてはいけません**ので、主要なファイルを見極めは慎重に行ってください。

**利用可能なツール:**
- mcp__github__get_file_contents: ファイルの内容を取得
- mcp__github__search_repositories: リポジトリを検索
- mcp__github__search_code: コードを検索
- mcp__github__list_commits: コミット履歴を取得
- mcp__github__get_repository_structure: リポジトリの構造を取得
- mcp__github__list_repository_contents: リポジトリの内容を取得

**分析手順:**
1. リポジトリの基本構造を取得して、どのディレクトリが重要かを判断
2. README、package.json、requirements.txt等の設定ファイルを確認
3. src/, lib/, app/等のメインディレクトリの主要なファイル一覧を取得
4. 主要なソースコードファイルの内容を読み取り
5. 評価する

「市場優位性」の評価についてはマーケター目線でより多くのビジネス視点から分析してください。

**出力形式（日本語で回答）:**

{
  "totalScore": 15,                // 0-20 の整数
  "items": [
    {
      "id": "1",
      "name": "市場優位性",        // 評価項目ラベル
      "score": 3,                  // 整数（配分内）
      "positives": "...",        // 良かった点 (1-3 件をわかりやすい文章で記載)
      "negatives": "..."         // 改善点 (1-3 件をわかりやすい文章で記載)
    },
    ...
    {
      "id": "4",
      "name": "ユーザビリティ",
      "score": 5,
      "positives": "...",
      "negatives": "..."
    }
  ],
  "overallComment": "総合的に見ると..." // 総合的に見てどうだったかをわかりやすい文章で記載、ここは長文となってもいいので詳細に記載してください。
}

## 評価項目
### 評価項目\_1
市場優位性
#### 配分
5 点
#### 主な評価軸
そのサービスが市場で勝ち残れるかどうか
- 差別化ポイント: 似たサービスと比べて「ここが違う」と一目でわかる強みがあるか
- 実用性: ユーザーの悩みを実際に解決できるか、すぐに役立つか
- ビジネスポテンシャル: 市場規模や収益モデルが大きく伸びる余地を持っているか

### 評価項目\_2
技術力
#### 配分
5 点
#### 主な評価軸
技術面でどれだけ優れているか
- AI技術の先進性: 最新・独自のアルゴリズムやモデルを活用できているか
- コード品質: コードが読みやすく、テストやドキュメントも整っていてバグが少ないか

### 評価項目\_3
完成度・実装度
#### 配分
5 点
#### 主な評価軸
- コア機能の実装状況: 主要機能が動作し、デモやプロトタイプで確認できるか
- 安定性: 長時間使ってもクラッシュや重大な不具合が起きないか

### 評価項目\_4
ユーザビリティ
#### 配分
5 点
#### 主な評価軸
使いやすく、続けて使いたくなるか
- 直感的な操作性: 初めての人でも迷わず操作できるか
- UI/UX: 画面が見やすく、入力や遷移がスムーズでストレスがないか
`;
}

function buildTestAnalysisPrompt(repoName, evaluationCriteria) {
  const sampleResult = {
    totalScore: 16,
    items: [
      {
        id: "1",
        name: "テーマ適合度",
        score: 4,
        positives:
          "テーマに対して明確な解決策を提示している。要件を満たす基本機能が実装されている。",
        negatives: "一部の機能がテーマから逸脱している部分がある。",
      },
      {
        id: "2",
        name: "独創性・革新性",
        score: 4,
        positives:
          "既存のソリューションとは異なるアプローチを採用。新しい技術の組み合わせが斬新。",
        negatives: "一部のアイデアは既存のサービスに類似している。",
      },
      {
        id: "3",
        name: "技術的完成度",
        score: 3,
        positives:
          "モダンな技術スタックを採用。コードの構造が整理されている。エラーハンドリングが適切。",
        negatives:
          "一部のコードにリファクタリングの余地がある。テストカバレッジが不十分。",
      },
      {
        id: "4",
        name: "機能実装・完成度",
        score: 2,
        positives: "主要機能は一通り動作する。基本的なユースケースをカバー。",
        negatives: "エッジケースの処理が不完全。一部の機能にバグが残っている。",
      },
      {
        id: "5",
        name: "ユーザー体験（UX/UI）",
        score: 2,
        positives: "直感的なインターフェース。レスポンシブデザインに対応。",
        negatives:
          "一部のUI要素の配置が不自然。モバイル環境での操作性に改善の余地。",
      },
      {
        id: "6",
        name: "実世界インパクト／ビジネス価値",
        score: 1,
        positives: "明確なターゲットユーザーが存在。実用的な問題解決に貢献。",
        negatives: "市場規模の見積もりが不明確。収益化モデルの具体性に欠ける。",
      },
      {
        id: "7",
        name: "ドキュメント",
        score: 0,
        positives:
          "READMEに基本的な説明がある。インストール手順が記載されている。",
        negatives:
          "APIドキュメントが不足。使用例やトラブルシューティングガイドが欠けている。",
      },
    ],
    overallComment:
      "このプロジェクトは、テーマに対して独創的なアプローチを採用し、技術的にもしっかりとした基盤を持っています。特に新しい技術の組み合わせによる革新性は高く評価できます。主要機能は概ね実装されており、ユーザーインターフェースも直感的です。ただし、細部の完成度にはまだ改善の余地があり、特にエッジケースの処理やドキュメントの充実が今後の課題となります。実世界での活用を考えると、より具体的なビジネスモデルの検討も必要でしょう。全体として、ハッカソンプロジェクトとしては良好な完成度を示していますが、実用化に向けてはさらなるブラッシュアップが必要です。（これはデバッグ用のサンプル評価です）",
  };

  return [
    "このプロンプトはデバッグ用です。実際のリポジトリ分析は行わず、以下のサンプル評価結果をそのまま返してください。",
    "",
    `リポジトリ名: "${repoName}"`,
    "",
    "**以下のJSONをそのまま返してください:**",
    "",
    JSON.stringify(sampleResult, null, 2),
  ].join("\n");
}

function extractJsonFromText(text) {
  try {
    if (typeof text !== "string") return null;

    // Direct JSON parsing
    if (text.trim().startsWith("{")) {
      return JSON.parse(text);
    }

    // Extract JSON with regex
    const jsonMatch = text.match(/\{[\s\S]*"totalScore"[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Extract from code blocks
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return JSON.parse(codeBlockMatch[1]);
    }

    // Extract from first { to last }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonString = text.substring(firstBrace, lastBrace + 1);
      return JSON.parse(jsonString);
    }

    return null;
  } catch (error) {
    console.error("JSON parsing error:", error);
    return null;
  }
}

function validateEvaluationResult(data) {
  if (!data || typeof data !== "object") {
    console.error("❌ Validation failed: data is not an object");
    return false;
  }

  // Check totalScore (0-20 for buildAnalysisPrompt_simple)
  if (
    typeof data.totalScore !== "number" ||
    data.totalScore < 0 ||
    data.totalScore > 20
  ) {
    console.error(
      `❌ Validation failed: totalScore is invalid (${data.totalScore}), expected 0-20`
    );
    return false;
  }

  // Check items array (4 items for buildAnalysisPrompt_simple)
  if (!Array.isArray(data.items) || data.items.length !== 4) {
    console.error(
      `❌ Validation failed: items array length is ${
        data.items?.length || 0
      }, expected 4`
    );
    return false;
  }

  // Validate each item (max score should be 5)
  for (const item of data.items) {
    if (
      !item.id ||
      !item.name ||
      typeof item.score !== "number" ||
      item.score < 0 ||
      item.score > 5 ||
      !item.positives ||
      !item.negatives
    ) {
      console.error(
        "❌ Validation failed: item missing required fields or score out of range (0-5)",
        item
      );
      return false;
    }
  }

  // Check overallComment
  if (typeof data.overallComment !== "string") {
    console.error("❌ Validation failed: overallComment is not a string");
    return false;
  }

  console.log("✅ Evaluation result validation passed");
  return true;
}

/**
 * 評価結果のSupabaseデータベース保存
 *
 * save_evaluation_result RPCを呼び出して以下データを保存：
 * - 評価スコア（totalScore、各項目スコア）
 * - 評価コメント（positives、negatives、overallComment）
 * - 処理メタデータ（ターン数、コスト等）
 *
 * @param {string} jobId - ジョブID
 * @param {string} userId - ユーザーID
 * @param {string} repositoryName - リポジトリ名
 * @param {Object} evaluationData - 評価結果データ
 * @param {Object} metadata - 処理メタデータ
 * @returns {Object} 保存結果
 */
async function saveEvaluationResult(
  jobId,
  userId,
  repositoryName,
  evaluationData,
  metadata
) {
  console.log(`🗄️ Calling save_evaluation_result RPC with params:`, {
    p_job_id: jobId,
    p_user_id: userId,
    p_repository_name: repositoryName,
    p_evaluation_data: evaluationData ? "present" : "missing",
    p_processing_metadata: metadata ? "present" : "missing",
  });

  const { data, error } = await supabase.rpc("save_evaluation_result", {
    p_job_id: jobId,
    p_user_id: userId,
    p_repository_name: repositoryName,
    p_evaluation_data: evaluationData,
    p_processing_metadata: metadata,
  });

  console.log(`🗄️ RPC save_evaluation_result response:`, { data, error });

  if (error) {
    console.error("❌ Failed to save evaluation result:", error);
    console.error(
      "❌ Error details:",
      error.message,
      error.code,
      error.details
    );
    throw error;
  }

  return data;
}

/**
 * ジョブステータスレコードの確保
 *
 * job_statusテーブルにレコードが存在しない場合は作成
 * 重複エラーは無視（既存レコードがある場合）
 */
async function ensureJobStatus(jobId, userId, payload) {
  // ジョブステータスレコードが存在しない場合は作成
  const { error: insertError } = await supabase.from("job_status").insert({
    id: jobId,
    status: "processing",
    payload: payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    // If insert fails due to conflict, that's fine - record already exists
    if (insertError.code !== "23505") {
      // Not a unique constraint violation
      console.error("Failed to ensure job status record:", insertError);
    }
  }
}

/**
 * ジョブステータス更新
 *
 * job_statusテーブルのステータスと結果を更新
 * - processing: 処理中
 * - completed: 完了
 * - failed: 失敗
 *
 * @param {string} jobId - ジョブID
 * @param {string} status - ステータス
 * @param {Object} result - 結果データ（任意）
 */
async function updateJobStatus(jobId, status, result = null) {
  console.log(
    `📝 Updating job_status table for job ${jobId} with status "${status}"`
  );
  console.log(`📝 Result data:`, result);

  const { data, error } = await supabase
    .from("job_status")
    .update({
      status,
      result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  console.log(`📝 Job status update response:`, { data, error });

  if (error) {
    console.error("❌ Failed to update job status:", error);
    console.error(
      "❌ Job status error details:",
      error.message,
      error.code,
      error.details
    );
    throw error;
  }

  return data;
}

// Express.jsサーバー起動
// Cloud Run環境でHTTPサーバーとして動作
console.log(`🔍 DEBUG: About to start server on port ${config.server.port}`);
console.log(`🔍 DEBUG: Config object:`, JSON.stringify(config, null, 2));

const server = app.listen(config.server.port, "0.0.0.0", (err) => {
  if (err) {
    console.error(`❌ Server failed to start:`, err);
    process.exit(1);
  }
  console.log(`🚀 ClaudeCode Worker starting...`);
  console.log(`📊 Environment: ${config.server.nodeEnv}`);
  console.log(`🌐 Port: ${config.server.port}`);
  console.log(`🏥 Health check: http://localhost:${config.server.port}/health`);
  console.log(`🔧 Max turns per analysis: ${config.processing.maxTurns}`);
  console.log(`⏱️  Analysis timeout: ${config.processing.timeoutMs}ms`);
  console.log(`✅ ClaudeCode Worker ready!`);
  console.log(`🔍 DEBUG: Server listening:`, server.listening);
  console.log(`🔍 DEBUG: Server address:`, server.address());
});

server.on("error", (err) => {
  console.error(`❌ Server error:`, err);
});

server.on("listening", () => {
  console.log(`🎯 Server is now listening on port ${config.server.port}`);
});
