# HackScoreAI Backend - 【backend_1】〜【backend_4】実装

## 概要
GitHub リポジトリを ClaudeCode で解析し、ハッカソン評価基準に基づくスコアを自動生成するバックエンドシステムです。

## 構成
- **enqueue**: ジョブをキューに投入するEdge Function
- **repo_worker**: ClaudeCode実行とリポジトリ解析を行うEdge Worker
- **vault_test**: Vault機能のテスト用Edge Function
- **pgmq**: PostgreSQLベースのメッセージキューシステム
- **Vault**: AnthropicキーとGitHubトークンの暗号化管理
- **ClaudeCode SDK**: リポジトリ解析とハッカソン評価の実行
- **評価結果DB**: JSON評価結果の構造化保存

## セットアップ手順

### 1. 環境変数の設定
```bash
cd backend
cp .env.example .env
# .envファイルを編集してVAULT_SECRET_KEYなどを設定
```

### 2. Supabaseローカル環境の起動
```bash
supabase start
```

### 3. Edge Functionsの起動
```bash
# 別のターミナルで実行
supabase functions serve
```

## 動作確認

### 【backend_1】キューテスト
```bash
node test-queue.js
```

### 【backend_2】Vaultテスト
```bash
node test-vault.js
```

### 【backend_3】【backend_4】実際のAPIキー登録
```bash
# 対話式でAPIキーを登録
node register-keys.js

# または手動でAPIキーを登録
curl -X POST "http://localhost:54321/functions/v1/vault_test" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "store",
    "userId": "11111111-1111-1111-1111-111111111111",
    "secretType": "anthropic_key",
    "secretName": "production",
    "secretValue": "sk-ant-api03-YOUR-ACTUAL-KEY"
  }'
```

### 【backend_3】【backend_4】完全パイプラインテスト
```bash
# 実際のAPI呼び出しを含むテスト（料金が発生します）
node test-full-pipeline.js --confirm
```

#### キューテストの内容：
1. ジョブをキューに投入
2. ジョブステータスの確認
3. ワーカーの手動実行
4. 処理結果の確認

#### Vaultテストの内容：
1. 暗号化・復号化テスト
2. シークレット保存・取得テスト
3. ユーザーシークレット一覧表示
4. Edge WorkerからのVaultキー取得テスト

### 手動でのAPI呼び出し

#### ジョブの投入
```bash
curl -X POST http://localhost:54321/functions/v1/enqueue/enqueue \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{
    "repositories": ["user/repo1", "user/repo2"],
    "evaluationCriteria": {
      "codeQuality": 0.3,
      "documentation": 0.2,
      "innovation": 0.3,
      "complexity": 0.2
    }
  }'
```

#### ジョブステータスの確認
```bash
curl http://localhost:54321/functions/v1/enqueue/status/{jobId} \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
```

#### ワーカーの手動実行
```bash
curl -X POST http://localhost:54321/functions/v1/repo_worker/process \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json"
```

## データベーステーブル

### job_status
ジョブの状態を管理するテーブル
- `id`: ジョブID
- `queue_message_id`: pgmqのメッセージID
- `status`: pending | queued | processing | completed | failed
- `payload`: ジョブのペイロード
- `result`: 処理結果
- `error`: エラーメッセージ

### user_secrets
暗号化されたユーザーシークレットを管理するテーブル
- `id`: シークレットID
- `user_id`: ユーザーID
- `secret_type`: シークレットタイプ（anthropic_key, github_tokenなど）
- `secret_name`: シークレット名
- `encrypted_secret`: 暗号化されたシークレット値
- `created_at`, `updated_at`: 作成・更新日時

### Vault関数
- `store_user_secret()`: シークレット保存
- `get_user_secret()`: シークレット取得
- `get_secret_for_job()`: Edge Function用シークレット取得
- `list_user_secrets()`: ユーザーシークレット一覧

## 実装済み機能

### 【backend_1】✅ 完了
- pgmqベースのキューシステム
- Edge Function (enqueue) でのジョブ投入
- Edge Worker (repo_worker) でのキュー処理
- ジョブステータス管理

### 【backend_2】✅ 完了
- pgcryptoベースの暗号化Vault
- ユーザーシークレット管理
- Edge WorkerからのVaultキー取得
- 暗号化・復号化の完全テスト

### 【backend_3】✅ 完了
- ClaudeCode SDKの実装（参考ソースを基に）
- Edge WorkerでのClaudeCode実行統合
- GitHub MCPを使用したリポジトリ解析
- ハッカソン評価基準による採点

### 【backend_4】✅ 完了
- 評価結果JSONの自動検知
- evaluation_resultsテーブルへの構造化保存
- evaluation_itemsテーブルでの詳細評価項目管理
- SQLクエリ関数による結果取得

## 🎉 全機能実装完了
バックエンドの全ての要件が実装され、テスト可能な状態です。