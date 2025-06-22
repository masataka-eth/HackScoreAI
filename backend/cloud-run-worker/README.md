# HackScore AI - Cloud Run Worker

ClaudeCode SDK を使用してGitHubリポジトリを解析し、ハッカソン評価を行うCloud Run Worker。

## 🚀 セットアップ

### 1. 環境変数設定

```bash
cp .env.example .env
# .env ファイルを編集して必要な値を設定
```

### 2. 依存関係インストール

```bash
npm install
```

### 3. 開発サーバー起動

```bash
npm run dev
# または
npm run dev:setup
```

## 🔧 環境変数

| 変数名 | 説明 | 必須 | デフォルト |
|--------|------|------|-----------|
| `SUPABASE_URL` | Supabase プロジェクトURL | ✅ | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー | ✅ | - |
| `CLOUD_RUN_AUTH_TOKEN` | 認証用トークン | ✅ | - |
| `PORT` | サーバーポート | ❌ | 8080 |
| `NODE_ENV` | 実行環境 | ❌ | development |
| `MAX_TURNS_PER_ANALYSIS` | 分析の最大ターン数 | ❌ | 50 |
| `ANALYSIS_TIMEOUT_MS` | 分析タイムアウト（ミリ秒） | ❌ | 300000 |
| `LOG_LEVEL` | ログレベル | ❌ | info |

## 📡 API エンドポイント

### Health Check
```bash
GET /health
```

### Repository Analysis
```bash
POST /process
Authorization: Bearer YOUR_AUTH_TOKEN
Content-Type: application/json

{
  "jobId": "uuid",
  "userId": "user-uuid", 
  "repositories": ["user/repo1", "user/repo2"],
  "evaluationCriteria": {
    "themeRelevance": 0.1,
    "innovation": 0.2,
    "technicalQuality": 0.2,
    "functionality": 0.15,
    "ux": 0.15,
    "businessValue": 0.1,
    "documentation": 0.1
  }
}
```

### Queue Polling
```bash
POST /poll
Authorization: Bearer YOUR_AUTH_TOKEN
```

## 🐳 Docker

### ローカルでDockerを使用

```bash
# イメージビルド
npm run docker:build

# コンテナ実行
npm run docker:run
```

## ☁️ Cloud Run デプロイ

### 1. Google Cloud CLI設定

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2. シークレット作成

```bash
# Cloud Secret Manager でシークレットを作成
gcloud secrets create hackscore-secrets --data-file=.env
```

### 3. デプロイ実行

```bash
npm run deploy YOUR_PROJECT_ID asia-northeast1
```

## 🔒 セキュリティ

- すべてのAPI endpointは認証必須（Health Check除く）
- 機密情報はSupabase Vaultから直接取得
- 環境変数での設定管理
- Cloud Secret Manager連携

## 🔄 処理フロー

1. Edge Functions からジョブ転送受信
2. Supabase Vault から機密情報取得
3. ClaudeCode SDK でリポジトリ解析
4. 評価結果をSupabase Database に保存
5. ジョブステータス更新

## ⚠️ 注意事項

- ClaudeCode SDK は Node.js 18+ が必要
- 分析には時間とコストがかかります
- 本番環境では適切なリソース制限を設定してください

## 🧪 テスト

```bash
# ヘルスチェック
curl http://localhost:8080/health

# 認証テスト
curl -X POST http://localhost:8080/process \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test","userId":"test-user","repositories":["microsoft/vscode"]}'
```