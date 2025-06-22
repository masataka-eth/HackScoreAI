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
    const { repositories, userId, evaluationCriteria, jobId } = req.body;

    console.log(`🔍 Processing job ${jobId} for repositories:`, repositories);

    // Get user secrets directly from Supabase Vault (secure)
    const secrets = await getUserSecrets(userId);

    // Process each repository with ClaudeCode
    const results = [];
    for (const repoName of repositories) {
      const result = await processRepositoryWithClaudeCode(
        repoName,
        secrets,
        evaluationCriteria
      );

      if (result.success) {
        // Save to Supabase database
        await saveEvaluationResult(
          jobId,
          userId,
          repoName,
          result.evaluation,
          result.metadata
        );
      }

      results.push({
        repository: repoName,
        success: result.success,
        error: result.error,
        totalScore: result.evaluation?.totalScore,
      });
    }

    // Update job status in Supabase
    await updateJobStatus(jobId, "completed", { results });

    res.json({
      success: true,
      jobId,
      results,
      processedRepositories: results.length,
      successfulAnalyses: results.filter((r) => r.success).length,
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
    console.log("📥 Polling for jobs...");

    // Read from pgmq queue
    const { data: messages, error } = await supabase.rpc("pgmq_read", {
      queue_name: "repo_analysis_queue",
      visibility_timeout: 300,
    });

    if (error) {
      throw new Error(`Queue read error: ${error.message}`);
    }

    if (!messages || messages.length === 0) {
      return res.json({ message: "No jobs in queue" });
    }

    const message = messages[0];
    console.log("📨 Processing message:", message.msg_id);

    // Update job status to processing
    await updateJobStatus(message.message.jobId, "processing");

    try {
      // Process the job
      const processResult = await fetch(
        `${req.protocol}://${req.get("host")}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message.message),
        }
      );

      if (processResult.ok) {
        // Delete message from queue on success
        await supabase.rpc("pgmq_delete", {
          queue_name: "repo_analysis_queue",
          msg_id: message.msg_id,
        });
      } else {
        throw new Error(`Process failed with status: ${processResult.status}`);
      }
    } catch (processError) {
      // Archive failed message
      await supabase.rpc("pgmq_archive", {
        queue_name: "repo_analysis_queue",
        msg_id: message.msg_id,
      });
      throw processError;
    }

    res.json({
      success: true,
      messageId: message.msg_id,
      jobId: message.message.jobId,
    });
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

    const prompt = buildAnalysisPrompt(repoName, evaluationCriteria);
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
  const { data, error } = await supabase.rpc("save_evaluation_result", {
    p_job_id: jobId,
    p_user_id: userId,
    p_repository_name: repositoryName,
    p_evaluation_data: evaluationData,
    p_processing_metadata: metadata,
  });

  if (error) {
    console.error("Failed to save evaluation result:", error);
    throw error;
  }

  return data;
}

async function updateJobStatus(jobId, status, result = null) {
  const { error } = await supabase
    .from("job_status")
    .update({
      status,
      result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("Failed to update job status:", error);
  }
}

// Start server
console.log(`🔍 DEBUG: About to start server on port ${config.server.port}`);
console.log(`🔍 DEBUG: Config object:`, JSON.stringify(config, null, 2));

const server = app.listen(config.server.port, '0.0.0.0', (err) => {
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

server.on('error', (err) => {
  console.error(`❌ Server error:`, err);
});

server.on('listening', () => {
  console.log(`🎯 Server is now listening on port ${config.server.port}`);
});
