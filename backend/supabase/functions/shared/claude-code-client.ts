// ClaudeCode client for Edge Functions
// Adapted from reference source for Supabase Edge Function environment

export interface EvaluationItem {
  id: string;
  name: string;
  score: number;
  positives: string;
  negatives: string;
}

export interface EvaluationResult {
  totalScore: number;
  items: EvaluationItem[];
  overallComment: string;
}

export interface ProcessingMetadata {
  numTurns: number;
  totalCostUsd: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

export class ClaudeCodeClient {
  private anthropicApiKey: string;
  private githubToken: string;

  constructor(anthropicApiKey: string, githubToken: string) {
    this.anthropicApiKey = anthropicApiKey;
    this.githubToken = githubToken;
  }

  async analyzeRepository(repoName: string): Promise<{
    result: EvaluationResult | null;
    metadata: ProcessingMetadata;
  }> {
    console.log(`🔍 Starting analysis for repository: ${repoName}`);

    const startTime = Date.now();
    let numTurns = 0;
    let totalCostUsd = 0;
    let evaluationResult: EvaluationResult | null = null;

    try {
      // Import Claude Code SDK (dynamic import for Edge Function compatibility)
      const { query } = await import('https://esm.sh/@anthropic-ai/claude-code@latest');

      const prompt = this.buildAnalysisPrompt(repoName);
      const abortController = new AbortController();

      // Configure Claude Code query
      const queryOptions = {
        prompt,
        abortController,
        options: {
          maxTurns: 50, // Reduced for Edge Function timeout limits
          apiKey: this.anthropicApiKey,
          mcpServers: {
            github: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              env: {
                GITHUB_PERSONAL_ACCESS_TOKEN: this.githubToken,
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

      // Process Claude Code response
      for await (const message of query(queryOptions)) {
        numTurns++;

        if (message.type === "assistant") {
          console.log(`Turn ${numTurns}: Assistant response`);
          
          // Extract content text
          let contentText = "";
          if (typeof message.message.content === "string") {
            contentText = message.message.content;
          } else if (Array.isArray(message.message.content)) {
            contentText = message.message.content
              .filter((item: any) => item.type === "text")
              .map((item: any) => item.text)
              .join("");
          }

          // Try to extract JSON from each message
          const extractedJson = this.extractJsonFromText(contentText);
          if (extractedJson && this.validateEvaluationResult(extractedJson)) {
            evaluationResult = extractedJson;
            console.log("✅ Valid evaluation result JSON detected");
            break; // Exit early when we have a valid result
          }

        } else if (message.type === "result") {
          if (message.subtype === "success") {
            numTurns = message.num_turns;
            totalCostUsd = message.total_cost_usd;
            console.log(`📊 Analysis completed - Turns: ${numTurns}, Cost: $${totalCostUsd.toFixed(4)}`);
          } else {
            throw new Error(`Analysis failed: ${message.subtype}`);
          }
        }
      }

      if (!evaluationResult) {
        throw new Error("No valid evaluation result found in Claude Code response");
      }

      const durationMs = Date.now() - startTime;

      return {
        result: evaluationResult,
        metadata: {
          numTurns,
          totalCostUsd,
          durationMs,
          success: true
        }
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error("❌ Error during analysis:", error);
      
      return {
        result: null,
        metadata: {
          numTurns,
          totalCostUsd,
          durationMs,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private buildAnalysisPrompt(repoName: string): string {
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
### 評価項目_1
テーマ適合度
#### 配分
10 点
#### 主な評価軸
与えられたテーマや課題に対してどれだけ的確に応えているか

### 評価項目_2
独創性・革新性
#### 配分
20 点
#### 主な評価軸
既存の解決策との差別化、新奇性、アイデアの意外性

### 評価項目_3
技術的完成度
#### 配分
20 点
#### 主な評価軸
コード品質、技術スタックの妥当性、アルゴリズム／アーキテクチャの洗練度

### 評価項目_4
機能実装・完成度
#### 配分
15 点
#### 主な評価軸
実際に「動く」かどうか、主要機能が一通り実装されているか

### 評価項目_5
ユーザー体験（UX/UI）
#### 配分
15 点
#### 主な評価軸
直感的な操作性、デザインの一貫性、アクセシビリティ

### 評価項目_6
実世界インパクト／ビジネス価値
#### 配分
10 点
#### 主な評価軸
社会的意義、市場規模、収益モデルの説得力

### 評価項目_7
ドキュメント
#### 配分
10 点
#### 主な評価軸
README や API ドキュメントの充実度
`;
  }

  private extractJsonFromText(text: string): EvaluationResult | null {
    try {
      if (typeof text !== "string") {
        return null;
      }

      // Method 1: Direct JSON parsing
      if (text.trim().startsWith("{")) {
        return JSON.parse(text);
      }

      // Method 2: Extract JSON part with regex
      const jsonMatch = text.match(/\{[\s\S]*"totalScore"[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Method 3: Extract from ```json blocks
      const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        return JSON.parse(codeBlockMatch[1]);
      }

      // Method 4: Extract from first { to last }
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

  private validateEvaluationResult(data: any): data is EvaluationResult {
    if (!data || typeof data !== "object") return false;

    // Check required fields
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

    // Validate each evaluation item
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
}