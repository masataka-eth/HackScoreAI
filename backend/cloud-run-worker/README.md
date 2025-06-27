# HackScore AI Worker

A high-performance, production-ready worker service that analyzes GitHub repositories using Claude Code SDK and evaluates them based on hackathon criteria. This worker processes jobs from a Supabase pgmq queue and provides comprehensive repository analysis.

## 🚀 Features

- **Queue-based Processing**: Scalable job processing with Supabase pgmq
- **AI-Powered Analysis**: Advanced repository analysis using Claude Code SDK with MCP (Model Context Protocol)
- **Hackathon Evaluation**: Specialized scoring system for hackathon projects
- **Secure Credential Management**: User credentials stored securely in Supabase Vault
- **Production Ready**: Supports both Cloud Run and Compute Engine deployment
- **Comprehensive Logging**: Detailed monitoring and error handling
- **RESTful API**: Clean endpoints for health checks and manual processing

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- Google Cloud Platform account
- Supabase project with pgmq enabled
- Anthropic API key with Claude Code access
- GitHub Personal Access Token

## 🛠️ Installation

### Clone and Install Dependencies

```bash
git clone https://github.com/your-org/hackscore-ai
cd hackscore-ai/backend/cloud-run-worker
npm install
```

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Required Environment Variables
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CLOUD_RUN_AUTH_TOKEN=your_secure_auth_token

# Optional Configuration
NODE_ENV=production
PORT=8080
MAX_TURNS_PER_ANALYSIS=200
ANALYSIS_TIMEOUT_MS=1800000
LOG_LEVEL=info
ESTIMATED_COST_PER_TOKEN=0.000003

# Claude Code SDK Configuration
NPM_CONFIG_PREFIX=/tmp/.npm-global
HOME=/tmp
TMPDIR=/tmp
NPM_CONFIG_CACHE=/tmp/.npm
NPM_CONFIG_UNSAFE_PERM=true
NODE_OPTIONS=--max-old-space-size=8192
XDG_CONFIG_HOME=/tmp/.config
```

## 🏃‍♂️ Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start in development mode (with file watching)
npm run dev

# Start in production mode
npm start
```

### Docker Deployment

```bash
# Build Docker image
npm run docker:build

# Run with Docker
npm run docker:run
```

## ☁️ Production Deployment

### Option 1: Google Compute Engine (Recommended)

For the best performance and full MCP support:

```bash
# Run the automated setup script
chmod +x compute-engine-setup.sh
./compute-engine-setup.sh
```

**Manual Compute Engine Setup:**

1. Create a Compute Engine instance:
```bash
gcloud compute instances create hackscore-worker \
  --zone=asia-northeast1-a \
  --machine-type=e2-standard-4 \
  --image-family=ubuntu-minimal-pro-2204-lts \
  --image-project=ubuntu-os-pro-cloud \
  --scopes=https://www.googleapis.com/auth/cloud-platform
```

2. Copy the setup script:
```bash
gcloud compute scp compute-engine-setup.sh hackscore-worker:~/setup.sh --zone=asia-northeast1-a
```

3. SSH and run setup:
```bash
gcloud compute ssh hackscore-worker --zone=asia-northeast1-a
chmod +x ~/setup.sh && ~/setup.sh
```

### Option 2: Google Cloud Run

```bash
# Deploy to Cloud Run
npm run deploy:cloud-run
```

## ⚙️ Technical Architecture & Best Practices

### Dynamic Environment Variable Management

**重要な技術的制約**: Claude Code SDKを使用する際、環境変数（Anthropic APIキー、GitHub トークン）を動的に変更する場合は、環境変数設定後にClaude Codeのインスタンスを再生成する必要があります。

#### 技術的原理

Claude Code SDKは初期化時に以下の処理を行います：

1. **環境変数の読み込み**: `ANTHROPIC_API_KEY`、`GITHUB_TOKEN`等の認証情報を process.env から取得
2. **MCP接続の確立**: GitHub MCPサーバーとの接続を確立し、認証トークンを使用してGitHub APIアクセスを初期化
3. **内部状態の固定**: 一度初期化された認証情報は、インスタンスの生存期間中は変更されない

```javascript
// ❌ 間違った方法: 環境変数変更後に同じインスタンスを使用
process.env.ANTHROPIC_API_KEY = newApiKey;
process.env.GITHUB_TOKEN = newGitHubToken;
// claudeCodeInstance は古い認証情報を保持している

// ✅ 正しい方法: 環境変数変更後にインスタンスを再生成
process.env.ANTHROPIC_API_KEY = newApiKey;
process.env.GITHUB_TOKEN = newGitHubToken;
claudeCodeInstance = new ClaudeCode(); // 新しい認証情報で再初期化
```

#### 実装上の注意点

**本プロジェクトでの対応**:
- ユーザーごとに異なるAPIキーを使用するため、`getUserSecrets()`でSupabase Vaultから取得した認証情報を環境変数に設定
- 各リポジトリ処理前に必ずClaude Codeインスタンスを新規作成
- 処理完了後はインスタンスを適切に破棄してメモリリークを防止

```javascript
// getUserSecrets でSupabase Vaultから取得
const { anthropicKey, githubToken } = await getUserSecrets(userId);

// 環境変数を動的に設定
process.env.ANTHROPIC_API_KEY = anthropicKey;
process.env.GITHUB_TOKEN = githubToken;

// 新しい認証情報でインスタンス生成
const claudeCode = new ClaudeCode();
```

### Deployment Architecture: Cloud Run vs Compute Engine

#### MCP (Model Context Protocol) 接続の技術的制約

Claude Code SDKは **MCP (Model Context Protocol)** を使用してGitHubとの統合を実現しています。しかし、サーバーレス環境でのMCP接続には以下の技術的困難があります：

#### Cloud Run の制約

**ファイルシステムの制限**:
- 読み取り専用ファイルシステム（`/tmp`以外）
- MCPサーバーのインストールと永続化が困難
- Node.js moduleの動的インストールに制限

**ネットワーク制約**:
- 外向きTCP接続の制限
- MCPサーバーとの双方向通信が不安定
- WebSocketベースの接続確立の困難

**実行時間制限**:
- リクエストタイムアウト（最大60分）
- 長時間実行される分析処理での強制終了リスク

```bash
# Cloud Runでよく見られるMCP関連エラー例
Error: Failed to start MCP server
Error: EACCES: permission denied, mkdir '/usr/local/lib/node_modules'
Error: Connection timeout to GitHub MCP server
```

#### Compute Engine の利点

**完全なファイルシステムアクセス**:
- MCPサーバーの永続的インストールと設定が可能
- Node.js globalパッケージの管理が柔軟

**安定したネットワーク接続**:
- 外向きTCP/WebSocket接続が制限なし
- MCPサーバーとの継続的な双方向通信が可能

**実行時間の制約なし**:
- 大規模リポジトリの長時間分析に対応
- バックグラウンドでの継続的なキュー処理

#### ベストプラクティス

**現在の推奨構成**:
```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐
│   Frontend      │    │   Supabase       │    │ Compute Engine │
│  (Next.js)      │───▶│   (pgmq queue)   │───▶│  Worker + MCP  │
└─────────────────┘    └──────────────────┘    └────────────────┘
```

**将来の技術発展**:
- Anthropic社によるMCP over HTTP対応
- サーバーレス環境でのMCP接続改善
- Cloud Run第2世代でのファイルシステム制約緩和

> **💡 重要**: Claude Code自体はCloud Runでも動作しますが、GitHub MCPサーバーとの接続が必要な統合分析では、現時点ではCompute Engine環境での運用が最も安定しています。

## 🔧 Configuration

### Secret Manager Setup

Store secrets in Google Cloud Secret Manager:

```bash
# Supabase configuration
echo "your_supabase_url" | gcloud secrets create supabase-url --data-file=-
echo "your_service_role_key" | gcloud secrets create supabase-service-role-key --data-file=-

# Authentication token
echo "your_secure_token" | gcloud secrets create cloud-run-auth-token --data-file=-

# Worker URL (for frontend integration)
echo "http://your-worker-ip:8080" | gcloud secrets create cloud-run-worker-url --data-file=-
```

### Supabase Setup

1. Enable pgmq extension in your Supabase project
2. Create required tables and functions:
```sql
-- Enable pgmq extension
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create evaluation results table
CREATE TABLE evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  user_id UUID NOT NULL,
  repository_name TEXT NOT NULL,
  evaluation_data JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create job status table
CREATE TABLE job_status (
  job_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 📡 API Endpoints

### Health Check
```
GET /health
```
Returns service health status and configuration.

### Test Endpoint
```
GET /test
```
Simple connectivity test.

### Process Repository (Authentication Required)
```
POST /process
Authorization: Bearer <your_auth_token>

{
  "repository": "owner/repo-name",
  "userId": "user-uuid",
  "evaluationCriteria": { ... },
  "jobId": "job-uuid",
  "hackathonId": "hackathon-uuid"
}
```

### Poll Queue (Authentication Required)
```
POST /poll
Authorization: Bearer <your_auth_token>
```
Processes all pending jobs in the queue.

## 🔍 Monitoring

### Real-time Logs

**For systemd service (Compute Engine):**
```bash
# SSH into your instance
gcloud compute ssh hackscore-worker --zone=asia-northeast1-a

# View real-time logs
sudo journalctl -u hackscore-worker -f --tail=50

# Filter for errors
sudo journalctl -u hackscore-worker -f | grep -i error
```

**For Docker deployment:**
```bash
docker logs -f hackscore-worker
```

### Health Monitoring

```bash
# Check service health
curl http://your-worker-ip:8080/health

# Expected response:
{
  "status": "ok",
  "service": "claudecode-worker",
  "version": "1.0.0",
  "environment": "production",
  "timestamp": "2025-06-27T14:52:44.812Z",
  "config": {
    "maxTurns": 200,
    "timeoutMs": 1800000
  }
}
```

## 🧪 Testing

### Basic Connectivity Test
```bash
curl http://your-worker-ip:8080/test
# Expected: "Hello from Cloud Run Worker!"
```

### Process a Repository
```bash
curl -X POST http://your-worker-ip:8080/process \
  -H "Authorization: Bearer your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "octocat/Hello-World",
    "userId": "user-uuid",
    "evaluationCriteria": {},
    "jobId": "test-job-uuid",
    "hackathonId": "test-hackathon-uuid"
  }'
```

## 🛡️ Security

- All processing endpoints require Bearer token authentication
- User credentials are securely stored in Supabase Vault
- Environment variables are managed via Google Secret Manager
- Network access controlled via firewall rules

## 🚨 Troubleshooting

### Common Issues

1. **Claude Code SDK Import Errors**
   - Ensure you're using Compute Engine (not Cloud Run) for full MCP support
   - Verify Anthropic API key has Claude Code access

2. **Supabase Connection Issues**
   - Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   - Verify pgmq extension is enabled

3. **Authentication Errors**
   - Ensure CLOUD_RUN_AUTH_TOKEN matches between client and server
   - Check Secret Manager permissions

### Debug Commands

```bash
# Check service status
sudo systemctl status hackscore-worker

# View detailed logs
sudo journalctl -u hackscore-worker -n 100 --no-pager

# Test local connectivity
curl -s http://localhost:8080/health | jq .

# Check process
ps aux | grep node
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic](https://www.anthropic.com/) for Claude Code SDK
- [Supabase](https://supabase.com/) for database and queue management
- [Google Cloud](https://cloud.google.com/) for hosting infrastructure

---

**HackScore AI Worker** - Powering intelligent repository analysis for hackathons 🚀