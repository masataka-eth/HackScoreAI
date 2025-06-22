# HackScoreAI Backend - 【backend_1】【backend_2】実装

## 概要
Supabase の Queues にジョブを投入し、Edge Worker で処理する仕組み + Vault からのキー取得機能の実装です。

## 構成
- **enqueue**: ジョブをキューに投入するEdge Function (Hono)
- **repo_worker**: キューからジョブを取り出して処理するEdge Worker (Hono)
- **vault_test**: Vault機能のテスト用Edge Function
- **pgmq**: PostgreSQLベースのメッセージキュー
- **Vault**: 暗号化されたAPIキー・トークン管理

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

## 次のステップ
- 【backend_3】実際に ClaudeCode を動かす
- 【backend_4】結果をデータベースに保存する（JSON を検知したら Supabase データベースに保存とする）