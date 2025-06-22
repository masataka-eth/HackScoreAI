# VaultにAPIキーを登録する手順

## 前提条件
- Supabaseがローカルで起動していること
- Edge Functionsが動作していること

## 手順1: 実際のAPIキーの準備

### Anthropic APIキーの取得
1. [Anthropic Console](https://console.anthropic.com/) にアクセス
2. ログイン後、「API Keys」セクションに移動
3. 「Create Key」をクリック
4. キー名を入力（例：`HackScoreAI-Development`）
5. 生成されたキー（`sk-ant-api03-...`で始まる）をコピー

### GitHub Personal Access Tokenの取得
1. [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens) にアクセス
2. 「Generate new token (classic)」をクリック
3. Note: `HackScoreAI-Development`
4. Expiration: 適切な期限を選択
5. Select scopes:
   - `repo` (Full control of private repositories)
   - `read:org` (Read org and team membership)
6. 「Generate token」をクリック
7. 生成されたトークン（`ghp_...`で始まる）をコピー

## 手順2: VaultにAPIキーを登録

### 方法A: vault_test Edge Functionを使用（推奨）

```bash
# 1. Anthropic APIキーを登録
curl -X POST "http://localhost:54321/functions/v1/vault_test" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "store",
    "userId": "11111111-1111-1111-1111-111111111111",
    "secretType": "anthropic_key",
    "secretName": "production",
    "secretValue": "sk-ant-api03-YOUR-ACTUAL-KEY-HERE"
  }'

# 2. GitHub tokenを登録
curl -X POST "http://localhost:54321/functions/v1/vault_test" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "store",
    "userId": "11111111-1111-1111-1111-111111111111",
    "secretType": "github_token",
    "secretName": "production",
    "secretValue": "ghp_YOUR-ACTUAL-TOKEN-HERE"
  }'
```

### 方法B: 対話型スクリプトを使用

```bash
# 対話型でAPIキーを登録
node register-keys.js
```

## 手順3: 登録の確認

```bash
# 登録されたシークレット一覧を確認
curl -X POST "http://localhost:54321/functions/v1/vault_test" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "list",
    "userId": "11111111-1111-1111-1111-111111111111"
  }'
```

## 手順4: 動作テスト

```bash
# 暗号化・復号化テストを実行
curl -X POST "http://localhost:54321/functions/v1/vault_test" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "test_encryption"
  }'
```

## セキュリティ注意事項

⚠️ **重要**:
1. APIキーを平文で保存しないこと
2. ログファイルにAPIキーが含まれないよう注意
3. 本番環境では、より強固な暗号化キーを使用
4. 定期的にAPIキーをローテーション

## トラブルシューティング

### エラー: "Failed to store secret"
- Supabaseが正常に起動しているか確認
- Edge Functionsが動作しているか確認
- JSON形式が正しいか確認

### エラー: "Unauthorized"
- Bearerトークンが正しいか確認
- Supabaseのサービスロールキーが設定されているか確認

### APIキーの形式確認
- Anthropic: `sk-ant-api03-` で始まる
- GitHub: `ghp_` で始まる（classic token）または `github_pat_` で始まる（fine-grained token）