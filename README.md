# HackScoreAI - AI エージェント開発の参考実装

GitHub リポジトリを**Claude Code SDK**で自動解析し、ハッカソン評価基準に基づくスコアを自動生成するプラットフォームです。

> **🤖 AI エージェント開発者の皆様へ**  
> このプロジェクトは、Claude Code SDK と MCP を活用した実用的な AI エージェントの参考実装です。サーバーレス環境での制約を克服し、安全な API キー管理を実現する設計パターンを学べます。

## 🏗️ システムアーキテクチャ

### 全体構成図

```mermaid
graph TB
    subgraph "Frontend (Vercel)"
        UI[Next.js 14 App Router<br/>+ shadcn/ui]
    end

    subgraph "Backend (Supabase)"
        Auth[Supabase Auth<br/>GitHub OAuth Provider]
        Edge[Edge Functions<br/>Hono + Deno]
        DB[(PostgreSQL<br/>+ pgmq Queue)]
        Vault[🔐 Supabase Vault<br/>APIキー暗号化]
    end

    subgraph "AI Worker (Compute Engine)"
        Worker[Express.js Server<br/>Claude Code SDK]
        MCP[MCP GitHub Tool<br/>リポジトリ解析]
    end

    subgraph "External APIs"
        GitHub[GitHub API<br/>リポジトリアクセス]
        Claude[Anthropic Claude<br/>AI評価エンジン]
    end

    UI --> Auth
    Auth --> GitHub
    UI --> Edge
    Edge --> DB
    Edge --> Worker
    Edge <--> Vault
    Auth <--> DB
    Vault <--> DB
    Worker --> MCP
    MCP --> GitHub
    Worker --> Claude
    Worker --> DB

    style UI fill:#e1f5fe
    style Auth fill:#e8f5e8
    style Edge fill:#f3e5f5
    style Worker fill:#fff3e0
    style Vault fill:#ffebee
    style DB fill:#f0f8ff
```

### システム構成の特徴

| 層                 | 技術スタック                                                                     | 役割                                      | AI エージェント開発での学習ポイント         |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| **フロントエンド** | Next.js 14 + shadcn/ui                                                           | UI/UX                                     | 🎯 ユーザーフレンドリーな AI ツール UI 設計 |
| **認証・データ層** | **Supabase 統合プラットフォーム**<br/>Auth + PostgreSQL + Vault + Edge Functions | 認証、データ永続化、キュー、機密管理、API | 🔐 **統合プラットフォームによる開発効率化** |
| **AI 処理層**      | **Compute Engine** + Claude Code SDK                                             | AI エージェント実行環境                   | 🤖 **Claude Code SDK の実践的活用方法**     |

> **⚠️ 重要な技術的制約**  
> Claude Code SDK + MCP (Model Context Protocol) 統合は、**VM 環境（Compute Engine 等）でのみ安定動作**します。  
> Cloud Run などのサーバーレス環境では、ファイルシステムの読み取り専用制約、MCP サーバーとの接続制限により正常に動作しません。  
> **実運用では必ず Compute Engine 等の常時稼働 VM 環境を使用してください。**

### 処理フローシーケンス

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as Supabase Auth
    participant E as Edge Functions
    participant Q as pgmq Queue
    participant W as Compute Engine Worker
    participant M as MCP GitHub
    participant C as Claude API
    participant V as Supabase Vault

    U->>F: ハッカソン作成
    F->>A: Supabase Auth認証確認
    A-->>F: JWT トークン取得
    F->>E: enqueue API呼び出し
    E->>V: APIキー取得
    V-->>E: 暗号化済みキー
    E->>Q: ジョブキューに投入
    E->>W: 処理開始通知

    W->>Q: ジョブ取得 (ポーリング)
    Q-->>W: ジョブデータ
    W->>V: APIキー復号化
    V-->>W: 復号済みキー

    W->>M: Claude Code SDK起動
    M->>M: MCP GitHub Tool初期化
    M->>C: リポジトリ解析実行
    C-->>M: 解析結果
    M-->>W: 評価結果JSON

    W->>E: 結果保存API呼び出し
    E->>E: DB保存処理
    E-->>W: 保存完了

    F->>F: リアルタイム更新
    F-->>U: 評価結果表示
```

## 🤖 AI エージェント開発者向け技術解説

### 1. 🎯 Claude Code SDK の汎用性と可能性

HackScoreAI で実証している**Claude Code SDK の活用パターン**は、あらゆるコード解析・生成タスクに応用可能です：

```javascript
// Compute Engine Worker での Claude Code SDK活用例
const { spawn } = require("child_process");

async function processRepositoryWithClaudeCode(
  repository,
  githubToken,
  evaluationCriteria
) {
  // Claude Code SDK プロセスを起動
  const claudeProcess = spawn(
    "claude-code",
    ["--api-key", anthropicKey, "--mcp-config", "./mcp-config.json", "chat"],
    {
      cwd: workDir,
      env: {
        ...process.env,
        GITHUB_TOKEN: githubToken, // MCP GitHub Tool用
      },
    }
  );

  // ストリーミングで評価プロンプトを送信
  claudeProcess.stdin.write(evaluationPrompt);

  // JSON結果を解析して構造化データを取得
  const evaluationResult = await parseStreamingResponse(claudeProcess.stdout);

  return evaluationResult;
}
```

**活用例**：

- 📝 **コードレビュー自動化** - PR 差分を解析してレビューコメント生成
- 🐛 **バグ検出エージェント** - セキュリティ脆弱性やパフォーマンス問題の特定
- 📚 **ドキュメント生成** - コードから技術仕様書の自動生成
- 🔄 **コード最適化** - リファクタリング提案の自動化

### 2. 🔧 MCP (Model Context Protocol) の威力

**MCP による拡張性**が Claude Code SDK の真の価値です：

```json
// mcp-config.json - MCP設定例
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "{{GITHUB_TOKEN}}"
      }
    }
  }
}
```

**拡張可能な MCP ツール**：

- 🗂️ **ファイルシステム操作** - ローカル/リモートファイルの読み書き
- 🌐 **Web API 連携** - REST API、GraphQL、Webhook 統合
- 🗃️ **データベース操作** - SQL 実行、NoSQL 操作
- ☁️ **クラウドサービス** - AWS、GCP、Azure 統合

### 3. 🔐 Supabase Vault による安全な API キー管理

**企業レベルのセキュリティ**を個人開発でも実現：

```typescript
// APIキーの暗号化保存
export const vaultOperations = {
  async storeKey(
    userId: string,
    keyType: "anthropic_key" | "github_token",
    keyValue: string
  ) {
    // Supabase Vault RPC関数で暗号化保存
    const { data, error } = await supabase.rpc("store_user_secret", {
      p_user_id: userId,
      p_secret_type: keyType,
      p_secret_name: "default",
      p_secret_value: keyValue, // 自動暗号化
    });
    return { success: !error, data };
  },
};
```

**セキュリティの利点**：

- 🔒 **自動暗号化** - AES-256 暗号化での保存
- 👤 **ユーザー分離** - Row Level Security (RLS) による分離
- 🔑 **キー管理** - ローテーション、有効期限管理
- 📊 **監査ログ** - アクセス履歴の自動記録

### 4. ⚡ サーバーレス制約の解決パターン

**Claude Code SDK はサーバーレス環境で動作しない**制約を、アーキテクチャ分離で解決：

```mermaid
graph LR
    A[Serverless Layer<br/>Edge Functions] --> B[VM Layer<br/>Compute Engine]
    A -.->|制約| C[❌ Claude Code SDK<br/>実行不可]
    B -.->|解決| D[✅ Claude Code SDK<br/>実行可能]

    style A fill:#ffcdd2
    style B fill:#c8e6c9
    style C fill:#ffcdd2
    style D fill:#c8e6c9
```

**実装パターン**：

```typescript
// Edge Function (サーバーレス層) - ジョブ管理のみ
export async function enqueue(req: Request) {
  // 1. リクエスト検証・認証
  // 2. pgmqキューにジョブ投入
  // 3. Cloud Run Workerに通知
}

// Compute Engine Worker (VM層) - AI処理実行
export async function processJob(req: Request) {
  // 1. Claude Code SDK起動
  // 2. MCP連携でリポジトリ解析
  // 3. 結果をデータベースに保存
}
```

### 5. 🚀 最速 AI エージェント開発スタック

**Next.js + Supabase 統合プラットフォーム + Compute Engine** の組み合わせによる高速開発：

#### **Supabase の統合力**

- **認証**: GitHub OAuth 設定だけで本格認証システム完成
- **データベース**: PostgreSQL + リアルタイム機能 + pgmq キュー
- **API**: Edge Functions でサーバーレス API
- **セキュリティ**: Vault + RLS で企業レベル安全性
- **インフラ**: 全てマネージドで運用コスト最小

| フェーズ     | 所要時間      | 成果物                                                              |
| ------------ | ------------- | ------------------------------------------------------------------- |
| **1 日目**   | UI 実装       | Next.js + shadcn/ui でプロトタイプ                                  |
| **2 日目**   | 認証・DB 設計 | **Supabase 統合設定**（Auth + PostgreSQL + Vault + Edge Functions） |
| **3 日目**   | AI 処理実装   | **Compute Engine** + Claude Code SDK 統合                           |
| **4-5 日目** | 本番デプロイ  | Vercel + Supabase + GCP 本番環境                                    |

**開発効率の秘密**：

- 🔄 **ホットリロード** - 全層でのリアルタイム開発
- 🧩 **型安全性** - TypeScript 統合による品質確保
- 📦 **コンポーネント再利用** - shadcn/ui による UI 高速構築
- 🏗️ **Supabase 統合** - 認証、DB、API、セキュリティが一体化
- ☁️ **マネージドサービス** - インフラ管理の最小化

## 📋 前提条件

- Node.js >= 18.0.0
- npm または yarn
- Docker Desktop
- GitHub アカウント
- Supabase CLI
- Google Cloud SDK (本番デプロイ時)

## 🚀 クイックスタート

### 1. 環境変数の設定

```bash
# フロントエンド環境変数
cp frontend/.env.example frontend/.env.local

# Cloud Run Worker環境変数
cp backend/cloud-run-worker/.env.example backend/cloud-run-worker/.env

# Supabase Edge Functions環境変数
cp backend/supabase/.env.example backend/supabase/.env
```

### 2. 開発環境起動

```bash
# 自動起動スクリプト（推奨）
./start_development.sh

# または手動起動
cd backend/supabase && supabase start
cd backend/supabase && supabase functions serve
cd backend/cloud-run-worker && npm install && npm run dev
cd frontend && npm install && npm run dev
```

### 3. 動作確認

- **フロントエンド**: http://localhost:3000
- **Supabase Studio**: http://127.0.0.1:54323
- **Cloud Run Worker**: http://localhost:8080/health
- **Edge Functions**: http://127.0.0.1:54321/functions/v1/

## 🔧 詳細セットアップ

### フロントエンド環境変数設定

`frontend/.env.local` に以下を設定：

```env
# GitHub OAuth設定（要事前作成）
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Supabase設定
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# NextAuth設定
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
```

### Compute Engine Worker 設定

`backend/cloud-run-worker/.env` に以下を設定：

```env
# Supabase設定
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 認証設定
CLOUD_RUN_AUTH_TOKEN=your-secure-auth-token

# Vault設定
VAULT_SECRET_KEY=your-vault-encryption-key

# Claude Code SDK設定
MAX_TURNS_PER_ANALYSIS=50
ANALYSIS_TIMEOUT_MS=300000
```

### Supabase Edge Functions 設定

`backend/supabase/.env` に以下を設定：

```env
# Cloud Run Worker統合
CLOUD_RUN_WORKER_URL=http://host.docker.internal:8080
CLOUD_RUN_AUTH_TOKEN=your-secure-auth-token

# GitHub OAuth設定
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Vault暗号化キー（32文字）
VAULT_SECRET_KEY=your-vault-secret-key-32-chars-long
```

### GitHub OAuth App 作成

1. [GitHub Developer Settings](https://github.com/settings/developers) にアクセス
2. "New OAuth App" をクリック
3. 以下の設定で作成：
   - Application name: HackScore AI
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/auth/callback`

## 🔐 API キー設定

運用には以下の API キーが必要です：

1. **Anthropic API Key**: Claude Code SDK 利用に必要
2. **GitHub Personal Access Token**: プライベートリポジトリアクセス用

設定ページ (http://localhost:3000/settings) から安全に登録できます。

## 📁 プロジェクト構造

```
HackScoreAI/
├── frontend/                    # Next.js 14 App Router アプリ
│   ├── src/app/                # ページルーティング
│   ├── src/components/         # 再利用可能UIコンポーネント
│   ├── src/lib/               # Supabaseクライアント、認証ユーティリティ
│   ├── src/types/             # TypeScript型定義
│   └── .env.example           # フロントエンド環境変数テンプレート
├── backend/
│   ├── supabase/               # Supabase プロジェクト設定
│   │   ├── functions/          # Edge Functions (Deno + Hono)
│   │   ├── migrations/         # データベースマイグレーション
│   │   ├── config.toml        # Supabase設定
│   │   └── .env.example       # Edge Functions環境変数
│   └── cloud-run-worker/       # Claude Code SDK実行環境
│       ├── src/index.js       # Express.js + Claude Code SDK
│       ├── mcp-config.json    # MCP設定
│       └── .env.example       # Worker環境変数
├── scripts/                    # 開発・デプロイスクリプト
└── README.md                   # このファイル
```

## 🧪 テスト実行

### バックエンドテスト

```bash
cd backend/cloud-run-worker

# キュー処理テスト
node test-queue.js

# Vault暗号化テスト
node test-vault.js

# Claude Code SDK統合テスト
node test-full-pipeline.js --confirm
```

### フロントエンドテスト

```bash
cd frontend

# ESLintチェック
npm run lint

# TypeScriptビルドテスト
npm run build

# 本番プレビュー
npm run start
```

## 🚀 本番デプロイ

### フロントエンド (Vercel)

```bash
vercel --prod
```

### バックエンド (Supabase + Compute Engine)

```bash
# Supabase本番環境デプロイ
supabase db push
supabase functions deploy

# Compute Engine Workerデプロイ
cd backend/cloud-run-worker
./scripts/deploy.sh
```

## 🐛 トラブルシューティング

### よくある問題と解決方法

#### 1. ポート競合エラー

```bash
# ポート使用状況確認
lsof -i :3000 :54321 :8080

# 競合プロセス終了
kill -9 <PID>
```

#### 2. Supabase 接続エラー

```bash
# ステータス確認
supabase status

# 再起動
supabase stop && supabase start
```

#### 3. Claude Code SDK 実行エラー

```bash
# Workerログ確認
curl http://localhost:8080/health

# MCP設定確認
cat backend/cloud-run-worker/mcp-config.json
```

#### 4. Edge Functions デバッグ

```bash
# デバッグモードで起動
supabase functions serve --debug

# 個別Function テスト
supabase functions invoke enqueue --data '{"test": true}'
```

## 🤝 コントリビューション

このプロジェクトは AI エージェント開発の学習リソースとして公開されています。

### 改善提案歓迎

- 🐛 バグ報告・修正
- 🚀 パフォーマンス最適化
- 📚 ドキュメント改善
- 🔧 新機能の提案

### 学習目的での活用

- 🎓 Claude Code SDK の実装パターン学習
- 🏗️ スケーラブルな AI エージェントアーキテクチャの参考
- 🔐 セキュアな API キー管理の実装例
- ⚡ サーバーレス制約の回避パターン

## 📞 サポート・質問

技術的な質問や AI エージェント開発に関する相談は、GitHub の Issues からお気軽にどうぞ。

---

> **🎯 このプロジェクトを通じて学べること**
>
> - Claude Code SDK を活用した実用的な AI エージェント開発
> - MCP による拡張可能なエージェント設計
> - 企業レベルのセキュリティを備えた個人開発
> - モダンな技術スタックでの高速プロトタイピング

**Happy Coding! 🚀**
