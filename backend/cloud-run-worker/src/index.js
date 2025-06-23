import express from "express";
import { createClient } from "@supabase/supabase-js";
import { query } from "@anthropic-ai/claude-code";
import "dotenv/config";

const app = express();
app.use(express.json());

// Environment variables validation
const requiredEnvVars = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUD_RUN_AUTH_TOKEN",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Configuration from environment variables
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
    timeoutMs: parseInt(process.env.ANALYSIS_TIMEOUT_MS) || 300000,
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
  cost: {
    estimatedCostPerToken:
      parseFloat(process.env.ESTIMATED_COST_PER_TOKEN) || 0.000003,
  },
};

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

// Middleware for authentication
const authenticateRequest = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token || token !== config.auth.token) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  next();
};

// Health check (no auth required)
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

// Simple test endpoint
app.get("/test", (req, res) => {
  console.log(`🧪 Test request received from ${req.ip}`);
  res.send("Hello from Cloud Run Worker!");
});

// Process single repository (HTTP trigger) - requires authentication
app.post("/process", authenticateRequest, async (req, res) => {
  try {
    console.log("🔍 Request body received:", JSON.stringify(req.body, null, 2));
    const { repository, userId, evaluationCriteria, jobId, hackathonId } =
      req.body;

    console.log(
      `🔍 Processing job ${jobId} for hackathon ${hackathonId} with repository:`,
      repository
    );

    // Ensure job_status record exists
    await ensureJobStatus(jobId, userId, { ...req.body, hackathonId });

    // Get user secrets directly from Supabase Vault (secure)
    const secrets = await getUserSecrets(userId);

    // Process the single repository with ClaudeCode
    const result = await processRepositoryWithClaudeCode(
      repository,
      secrets,
      evaluationCriteria
    );

    if (result.success) {
      try {
        console.log(`💾 Saving evaluation result for ${repository}...`);
        console.log(`💾 Job ID: ${jobId}, User ID: ${userId}`);
        console.log(
          `💾 Evaluation data:`,
          JSON.stringify(result.evaluation, null, 2)
        );

        // Save to Supabase database
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

    // Update job status in Supabase
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

    if (req.body.jobId) {
      await updateJobStatus(req.body.jobId, "failed", { error: error.message });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Poll Supabase queue and process jobs - requires authentication
app.post("/poll", authenticateRequest, async (req, res) => {
  try {
    console.log("📥 Starting continuous polling for jobs...");
    let processedCount = 0;
    let processedJobs = [];
    let hasErrors = false;
    let lastError = null;

    // Check initial queue state for debugging
    const { data: initialQueueStats } = await supabase.rpc("pgmq_metrics", {
      queue_name: "repo_analysis_queue",
    });
    console.log("📊 Initial queue state:", initialQueueStats);

    while (true) {
      console.log(`🔄 Polling iteration ${processedCount + 1}...`);

      // Read from pgmq queue with extended timeout
      console.log("🔍 Reading from pgmq queue with params:", {
        queue_name: "repo_analysis_queue",
        visibility_timeout: 1800, // 30分に大幅延長（処理時間余裕を考慮）
        qty: 1,
      });

      const { data: messages, error } = await supabase.rpc("pgmq_read", {
        queue_name: "repo_analysis_queue",
        visibility_timeout: 1800, // 30分に大幅延長（処理時間余裕を考慮）
        qty: 1,
      });

      console.log("🔍 Queue read result:", {
        messages: messages ? messages.length : 0,
        error: error?.message || null,
        firstMessageId:
          messages && messages.length > 0 ? messages[0].msg_id : null,
      });

      if (error) {
        console.error("❌ Queue read error details:", error);
        hasErrors = true;
        lastError = `Queue read error: ${error.message}`;
        break;
      }

      if (!messages || messages.length === 0) {
        console.log(
          `ℹ️ No more messages in queue - processed ${processedCount} jobs total`
        );

        // Log final queue state for debugging
        const { data: finalQueueStats } = await supabase.rpc("pgmq_metrics", {
          queue_name: "repo_analysis_queue",
        });
        console.log("📊 Final queue state:", finalQueueStats);
        break;
      }

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
        // Process the job
        console.log(
          `🚀 Starting processing for job ${message.message.jobId}...`
        );
        const processResult = await fetch(
          `http://localhost:${config.server.port}/process`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.auth.token}`,
            },
            body: JSON.stringify(message.message),
          }
        );

        if (processResult.ok) {
          console.log(
            `✅ Job ${message.message.jobId} processing completed successfully`
          );

          // Delete message from queue on success with verification
          console.log(`🗑️ Deleting message ${message.msg_id} from queue...`);
          const { data: deleteResult, error: deleteError } = await supabase.rpc(
            "pgmq_delete",
            {
              queue_name: "repo_analysis_queue",
              msg_id: message.msg_id,
            }
          );

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

          console.log(`✅ Successfully processed job ${message.message.jobId}`);
          processedJobs.push({
            messageId: message.msg_id,
            jobId: message.message.jobId,
            deleted: !deleteError,
          });
          processedCount++;
        } else {
          const errorText = await processResult.text();
          console.error(
            `❌ Job ${message.message.jobId} processing failed with status: ${processResult.status}, response: ${errorText}`
          );

          // Update job status to failed
          await updateJobStatus(message.message.jobId, "failed", {
            error: `Process endpoint returned status ${processResult.status}: ${errorText}`,
          });

          // Archive failed message with verification
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
        console.error(
          `❌ Job ${message.message.jobId} processing exception:`,
          processError
        );

        // Update job status to failed
        await updateJobStatus(message.message.jobId, "failed", {
          error: processError.message || "Unknown processing error",
        });

        // Archive failed message with verification
        console.log(`📦 Archiving exception message ${message.msg_id}...`);
        const { data: archiveResult, error: archiveError } = await supabase.rpc(
          "pgmq_archive",
          {
            queue_name: "repo_analysis_queue",
            msg_id: message.msg_id,
          }
        );

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

      // If message wasn't properly handled, we need to break to avoid infinite loop
      if (!messageHandled) {
        console.error(
          `⚠️ Message ${message.msg_id} was not properly handled (not deleted or archived), breaking to avoid infinite loop`
        );
        hasErrors = true;
        lastError = `Message ${message.msg_id} handling failed`;
        break;
      }

      // Check queue state after processing for debugging
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

    // Return summary of all processed jobs
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

async function getUserSecrets(userId) {
  const { data: anthropicKey } = await supabase.rpc("get_secret_for_job", {
    p_user_id: userId,
    p_secret_type: "anthropic_key",
  });

  const { data: githubToken } = await supabase.rpc("get_secret_for_job", {
    p_user_id: userId,
    p_secret_type: "github_token",
  });

  return { anthropicKey, githubToken };
}

async function processRepositoryWithClaudeCode(
  repoName,
  secrets,
  evaluationCriteria
) {
  let timeoutId;

  try {
    console.log(`🔍 Analyzing repository: ${repoName}`);

    const prompt = buildAnalysisPrompt_simple(repoName, evaluationCriteria);
    // const prompt = buildTestAnalysisPrompt(repoName, evaluationCriteria);
    const abortController = new AbortController();

    // タイムアウト設定
    timeoutId = setTimeout(() => {
      console.log(`⏰ Analysis timeout for ${repoName}, aborting...`);
      abortController.abort();
    }, config.processing.timeoutMs);

    const queryOptions = {
      prompt,
      abortController,
      options: {
        maxTurns: config.processing.maxTurns,
        apiKey: secrets.anthropicKey,
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_PERSONAL_ACCESS_TOKEN: secrets.githubToken,
            },
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
    };

    let evaluationResult = null;
    let numTurns = 0;
    let totalCostUsd = 0;

    for await (const message of query(queryOptions)) {
      numTurns++;

      if (message.type === "assistant") {
        console.log(`Turn ${numTurns}: Assistant response`);

        let contentText = "";
        if (typeof message.message.content === "string") {
          contentText = message.message.content;
        } else if (Array.isArray(message.message.content)) {
          contentText = message.message.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("");
        }

        const extractedJson = extractJsonFromText(contentText);
        if (extractedJson && validateEvaluationResult(extractedJson)) {
          evaluationResult = extractedJson;
          console.log(
            "✅ Valid evaluation result JSON detected - continuing to completion"
          );
          // breakを削除 - Claude Code SDKの正常完了を待つ
        }
      } else if (message.type === "result") {
        if (message.subtype === "success") {
          numTurns = message.num_turns;
          totalCostUsd = message.total_cost_usd;
          console.log(
            `📊 Analysis completed - Turns: ${numTurns}, Cost: $${totalCostUsd.toFixed(
              4
            )}`
          );
        } else {
          throw new Error(`Analysis failed: ${message.subtype}`);
        }
      }
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
  "totalScore": 86,                // 0-100 の整数
  "items": [
    {
      "id": "1",
      "name": "テーマ適合度",        // 評価項目ラベル
      "score": 8,                  // 整数（配分内）
      "positives": "...",        // 良かった点 (1-3 件をわかりやすい文章で記載)
      "negatives": "..."         // 改善点 (1-3 件をわかりやすい文章で記載)
    },
    ...
    {
      "id": "7",
      "name": "ドキュメント",
      "score": 5,
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
10 点
#### 主な評価軸
与えられたテーマや課題に対してどれだけ的確に応えているか

### 評価項目\_2
独創性・革新性
#### 配分
20 点
#### 主な評価軸
既存の解決策との差別化、新奇性、アイデアの意外性

### 評価項目\_3
技術的完成度
#### 配分
20 点
#### 主な評価軸
コード品質、技術スタックの妥当性、アルゴリズム／アーキテクチャの洗練度

### 評価項目\_4
機能実装・完成度
#### 配分
15 点
#### 主な評価軸
実際に「動く」かどうか、主要機能が一通り実装されているか

### 評価項目\_5
ユーザー体験（UX/UI）
#### 配分
15 点
#### 主な評価軸
直感的な操作性、デザインの一貫性、アクセシビリティ

### 評価項目\_6
実世界インパクト／ビジネス価値
#### 配分
10 点
#### 主な評価軸
社会的意義、市場規模、収益モデルの説得力

### 評価項目\_7
ドキュメント
#### 配分
10 点
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

「市場優位性」の評価についてはマーケター目線でより多くのビジネス視点から分析してください。必要であればWEB検索をして調査してください。

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
    totalScore: 75,
    items: [
      {
        id: "1",
        name: "テーマ適合度",
        score: 8,
        positives:
          "テーマに対して明確な解決策を提示している。要件を満たす基本機能が実装されている。",
        negatives: "一部の機能がテーマから逸脱している部分がある。",
      },
      {
        id: "2",
        name: "独創性・革新性",
        score: 15,
        positives:
          "既存のソリューションとは異なるアプローチを採用。新しい技術の組み合わせが斬新。",
        negatives: "一部のアイデアは既存のサービスに類似している。",
      },
      {
        id: "3",
        name: "技術的完成度",
        score: 16,
        positives:
          "モダンな技術スタックを採用。コードの構造が整理されている。エラーハンドリングが適切。",
        negatives:
          "一部のコードにリファクタリングの余地がある。テストカバレッジが不十分。",
      },
      {
        id: "4",
        name: "機能実装・完成度",
        score: 11,
        positives: "主要機能は一通り動作する。基本的なユースケースをカバー。",
        negatives: "エッジケースの処理が不完全。一部の機能にバグが残っている。",
      },
      {
        id: "5",
        name: "ユーザー体験（UX/UI）",
        score: 12,
        positives: "直感的なインターフェース。レスポンシブデザインに対応。",
        negatives:
          "一部のUI要素の配置が不自然。モバイル環境での操作性に改善の余地。",
      },
      {
        id: "6",
        name: "実世界インパクト／ビジネス価値",
        score: 7,
        positives: "明確なターゲットユーザーが存在。実用的な問題解決に貢献。",
        negatives: "市場規模の見積もりが不明確。収益化モデルの具体性に欠ける。",
      },
      {
        id: "7",
        name: "ドキュメント",
        score: 6,
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
  if (!data || typeof data !== "object") return false;

  if (
    typeof data.totalScore !== "number" ||
    data.totalScore < 0 ||
    data.totalScore > 100
  ) {
    return false;
  }

  if (!Array.isArray(data.items) || data.items.length !== 7) {
    return false;
  }

  for (const item of data.items) {
    if (
      !item.id ||
      !item.name ||
      typeof item.score !== "number" ||
      !item.positives ||
      !item.negatives
    ) {
      return false;
    }
  }

  if (typeof data.overallComment !== "string") {
    return false;
  }

  return true;
}

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

async function ensureJobStatus(jobId, userId, payload) {
  // First try to insert the job status record if it doesn't exist
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

// Start server
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
