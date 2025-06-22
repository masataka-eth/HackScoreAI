# HackScoreAI - ローカルデバッグ環境セットアップガイド

GitHub リポジトリをClaude Codeで自動解析し、ハッカソン評価基準に基づくスコアを生成するプラットフォームです。

## 🏗️ アーキテクチャ概要

- **フロントエンド**: Next.js 13 (App Router) + shadcn/ui
- **バックエンド**: Supabase Edge Functions + Hono
- **ワーカー**: Cloud Run + Express.js
- **データベース**: PostgreSQL + pgmq
- **認証**: Supabase Auth (GitHub OAuth)

## 📋 前提条件

- Node.js >= 18.0.0
- npm または yarn
- Docker Desktop
- GitHub アカウント
- Supabase CLI

## 🚀 クイックスタート

### 1. 環境変数の設定

```bash
# フロントエンド
cp frontend/.env.example frontend/.env.local

# バックエンド（Cloud Run Worker）
cp backend/cloud-run-worker/.env.example backend/cloud-run-worker/.env

# Supabase Edge Functions
cp backend/supabase/.env.example backend/supabase/.env
```

### 2. フロントエンド起動

```bash
cd frontend
npm install
npm run dev
```

### 3. Supabase起動

```bash
cd backend/supabase
supabase start
```

### 4. Edge Functions起動

```bash
cd backend/supabase
supabase functions serve
```

### 5. Cloud Run Worker起動

```bash
cd backend/cloud-run-worker
npm install
npm run dev
```

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

### バックエンド環境変数設定

#### Cloud Run Worker設定
`backend/cloud-run-worker/.env` に以下を設定：

```env
# Supabase設定
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 認証設定
CLOUD_RUN_AUTH_TOKEN=your-secure-auth-token

# Vault設定
VAULT_SECRET_KEY=your-vault-encryption-key

# 処理設定
MAX_TURNS_PER_ANALYSIS=50
ANALYSIS_TIMEOUT_MS=300000
```

#### Supabase Edge Functions設定
`backend/supabase/.env` に以下を設定：

```env
# Cloud Run Worker統合
CLOUD_RUN_WORKER_URL=http://host.docker.internal:8080
CLOUD_RUN_AUTH_TOKEN=your-secure-auth-token-here

# GitHub OAuth設定（要事前作成）
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Vault暗号化キー（32文字）
# 生成方法: openssl rand -hex 16
VAULT_SECRET_KEY=your-vault-secret-key-32-chars-long
```

### GitHub OAuth App作成

1. [GitHub Developer Settings](https://github.com/settings/developers) にアクセス
2. "New OAuth App" をクリック
3. 以下の設定で作成：
   - Application name: HackScore AI
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/auth/callback`

## 🐛 デバッグ手順

### 1. サービス起動順序

```bash
# 1. Supabase起動
cd backend/supabase && supabase start

# 2. Edge Functions起動
cd backend/supabase && supabase functions serve

# 3. Cloud Run Worker起動
cd backend/cloud-run-worker && npm run dev

# 4. フロントエンド起動
cd frontend && npm run dev
```

### 2. 動作確認

#### フロントエンド
- http://localhost:3000 でアクセス可能
- GitHub OAuth ログインが正常に動作

#### Supabase
- http://127.0.0.1:54323 でSupabase Studioにアクセス
- ポート54321でAPIが起動

#### Edge Functions
- http://127.0.0.1:54321/functions/v1/ で各functionにアクセス
- enqueue, repo_worker, vault_test が利用可能

#### Cloud Run Worker
- http://localhost:8080 でワーカーが起動
- ヘルスチェック: `curl http://localhost:8080/health`

### 3. トラブルシューティング

#### ポート競合エラー
```bash
# ポート使用状況確認
lsof -i :3000
lsof -i :54321
lsof -i :8080

# プロセス終了
kill -9 <PID>
```

#### Supabase接続エラー
```bash
# Supabaseステータス確認
supabase status

# Supabase再起動
supabase stop && supabase start
```

#### Edge Functions エラー
```bash
# Edge Functions ログ確認
supabase functions serve --debug

# 個別Function実行
supabase functions invoke enqueue --data '{"test": true}'
```

## 📊 テスト実行

### バックエンドテスト

```bash
cd backend/cloud-run-worker

# キューテスト
node test-queue.js

# Vaultテスト
node test-vault.js

# 完全パイプラインテスト（要APIキー）
node test-full-pipeline.js --confirm
```

### フロントエンドテスト

```bash
cd frontend

# Lint チェック
npm run lint

# ビルドテスト
npm run build

# 本番プレビュー
npm run start
```

## 🔐 API キー設定

プロダクション環境では以下のAPIキーが必要です：

1. **Anthropic API Key**: Claude利用に必要
2. **GitHub Personal Access Token**: プライベートリポジトリアクセスに必要

設定ページ (http://localhost:3000/settings) から安全に登録できます。

## 📁 ディレクトリ構造

```
HackScoreAI/
├── frontend/                    # Next.js アプリ
│   ├── src/app/                # App Router ページ
│   ├── src/components/         # UIコンポーネント
│   ├── .env.example           # 環境変数テンプレート
│   └── package.json
├── backend/
│   ├── supabase/               # Supabase設定
│   │   ├── functions/          # Edge Functions
│   │   ├── migrations/         # DBマイグレーション
│   │   ├── .env.example       # Edge Functions環境変数テンプレート
│   │   └── config.toml
│   └── cloud-run-worker/       # Express.js ワーカー
│       ├── src/
│       ├── .env.example       # Worker環境変数テンプレート
│       └── package.json
└── README.md                   # このファイル
```

## 🚀 本番デプロイ

### フロントエンド (Vercel)
```bash
# Vercelにデプロイ
vercel --prod
```

### バックエンド (Supabase + Cloud Run)
```bash
# Supabase本番環境にデプロイ
supabase db push
supabase functions deploy

# Cloud Run Workerデプロイ
cd backend/cloud-run-worker
./scripts/deploy.sh
```

## 📞 サポート

問題が発生した場合は、以下を確認してください：

1. 全サービスが正常に起動しているか
2. 環境変数が正しく設定されているか
3. ポート番号が競合していないか
4. APIキーが正しく設定されているか

各サービスのログを確認し、エラーメッセージを参考にしてください。