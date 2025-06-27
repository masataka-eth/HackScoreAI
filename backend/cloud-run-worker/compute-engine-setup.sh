#!/bin/bash
set -e

echo "==============================================="
echo "🚀 HackScore Worker - Complete Setup for Compute Engine"
echo "==============================================="

# Update system packages
echo "📦 Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install essential packages
echo "📦 Installing essential packages..."
sudo apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    unzip \
    jq

# Install Node.js (Latest LTS)
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install Google Cloud SDK (if not already installed)
echo "📦 Installing Google Cloud SDK..."
if ! command -v gcloud &> /dev/null; then
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -
    sudo apt-get update -y
    sudo apt-get install -y google-cloud-cli
else
    echo "✅ Google Cloud SDK already installed"
fi

# Authenticate with Google Cloud using instance service account
echo "🔐 Configuring Google Cloud authentication..."
gcloud config set project hackscore-ai-production
gcloud auth application-default print-access-token > /dev/null 2>&1 && echo "✅ Authentication successful"

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /opt/hackscore-worker
sudo chown $(whoami):$(whoami) /opt/hackscore-worker
cd /opt/hackscore-worker

# Download application source code
echo "📥 Downloading application source code..."
# Note: This will be updated to copy from local files

# Create package.json
cat > package.json << 'EOF'
{
  "name": "hackscore-cloudrun-worker",
  "version": "1.0.0",
  "description": "ClaudeCode worker for HackScoreAI on Compute Engine",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "build": "echo 'No build step required'",
    "test": "echo 'No tests specified'"
  },
  "dependencies": {
    "@anthropic-ai/claude-code": "^1.0.31",
    "@supabase/supabase-js": "^2.39.3",
    "express": "^4.18.2",
    "dotenv": "^16.3.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Create src directory
mkdir -p src

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Create environment file
echo "🔧 Creating environment configuration..."
cat > .env << 'EOF'
NODE_ENV=production
PORT=8080
MAX_TURNS_PER_ANALYSIS=200
ANALYSIS_TIMEOUT_MS=1800000
LOG_LEVEL=info
ESTIMATED_COST_PER_TOKEN=0.000003

# Node.js and npm Configuration for Claude Code SDK
NPM_CONFIG_PREFIX=/tmp/.npm-global
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/tmp/.npm-global/bin
HOME=/opt/hackscore-worker
TMPDIR=/tmp
NPM_CONFIG_CACHE=/tmp/.npm
NPM_CONFIG_UNSAFE_PERM=true
NODE_OPTIONS=--max-old-space-size=8192
XDG_CONFIG_HOME=/opt/hackscore-worker/.config
EOF

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p /tmp/.npm-global
mkdir -p /opt/hackscore-worker/.config
sudo chown -R $(whoami):$(whoami) /opt/hackscore-worker

# Set up systemd service
echo "⚙️ Creating systemd service..."
sudo tee /etc/systemd/system/hackscore-worker.service > /dev/null << 'EOF'
[Unit]
Description=HackScore Worker Service
After=network.target
Wants=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/hackscore-worker
Environment=NODE_ENV=production
EnvironmentFile=/opt/hackscore-worker/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hackscore-worker

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service (will start after index.js is copied)
sudo systemctl daemon-reload
sudo systemctl enable hackscore-worker

# Create log rotation
echo "📝 Setting up log rotation..."
sudo tee /etc/logrotate.d/hackscore-worker > /dev/null << 'EOF'
/var/log/hackscore-worker.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 644 ubuntu ubuntu
}
EOF

# Set up firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 8080/tcp
sudo ufw allow ssh
echo "y" | sudo ufw enable || true

# Create secret fetching script
echo "🔐 Creating secret fetching script..."
cat > fetch-secrets.sh << 'EOF'
#!/bin/bash
echo "🔐 Fetching secrets from Google Secret Manager..."

# Get Supabase URL
SUPABASE_URL=$(gcloud secrets versions access latest --secret="SUPABASE_URL")
echo "export SUPABASE_URL=\"$SUPABASE_URL\"" >> .env

# Get Supabase Service Role Key
SUPABASE_SERVICE_ROLE_KEY=$(gcloud secrets versions access latest --secret="SUPABASE_SERVICE_ROLE_KEY")
echo "export SUPABASE_SERVICE_ROLE_KEY=\"$SUPABASE_SERVICE_ROLE_KEY\"" >> .env

# Get Cloud Run Auth Token
CLOUD_RUN_AUTH_TOKEN=$(gcloud secrets versions access latest --secret="CLOUD_RUN_AUTH_TOKEN")
echo "export CLOUD_RUN_AUTH_TOKEN=\"$CLOUD_RUN_AUTH_TOKEN\"" >> .env

echo "✅ Secrets fetched successfully"
EOF

chmod +x fetch-secrets.sh

# Fetch secrets
echo "🔐 Fetching secrets..."
./fetch-secrets.sh

echo "==============================================="
echo "✅ Setup completed successfully!"
echo "==============================================="
echo "📁 Application directory: /opt/hackscore-worker"
echo "🌐 Service will be available at: http://$(curl -s http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H 'Metadata-Flavor: Google'):8080"
echo "📝 Logs: sudo journalctl -u hackscore-worker -f"
echo "⚙️ Service control: sudo systemctl {start|stop|restart|status} hackscore-worker"
echo ""
echo "🔧 Next steps:"
echo "1. Copy src/index.js from your local development environment"
echo "2. sudo systemctl start hackscore-worker"
echo "3. Test the service"
echo "===============================================" 