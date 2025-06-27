#!/bin/bash

# HackScore AI Worker - Compute Engine Automated Setup Script
# This script sets up a production-ready environment for the HackScore AI Worker
# on Google Compute Engine with Ubuntu Pro 22.04 LTS

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${1:-"hackscore-ai-production"}
ZONE=${2:-"asia-northeast1-a"}
INSTANCE_NAME=${3:-"hackscore-worker-v2"}
MACHINE_TYPE=${4:-"e2-standard-4"}
APP_DIR="/opt/hackscore-worker"
SERVICE_NAME="hackscore-worker"

echo -e "${BLUE}🚀 HackScore AI Worker - Compute Engine Setup${NC}"
echo -e "${YELLOW}Project: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Zone: ${ZONE}${NC}"
echo -e "${YELLOW}Instance: ${INSTANCE_NAME}${NC}"
echo ""

# Function to log messages
log_info() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running on Compute Engine
if [ ! -f /etc/google_compute_engine ]; then
    log_error "This script must be run on a Google Compute Engine instance"
    exit 1
fi

log_info "Starting HackScore AI Worker setup on Compute Engine..."

# Update system packages
log_info "Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install essential packages
log_info "Installing essential packages..."
sudo apt-get install -y \
    curl \
    git \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    jq \
    htop \
    vim \
    tmux

# Install Node.js 20.x (LTS)
log_info "Installing Node.js 20.x LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
log_info "Node.js version: ${NODE_VERSION}"
log_info "npm version: ${NPM_VERSION}"

# Install Google Cloud SDK (if not already installed)
if ! command -v gcloud &> /dev/null; then
    log_info "Installing Google Cloud SDK..."
    curl https://sdk.cloud.google.com | bash
    exec -l $SHELL
    source ~/.bashrc
else
    log_info "Google Cloud SDK already installed"
fi

# Configure Google Cloud SDK
log_info "Configuring Google Cloud SDK..."
gcloud config set project ${PROJECT_ID}
gcloud config set compute/zone ${ZONE}

# Create application directory
log_info "Creating application directory: ${APP_DIR}"
sudo mkdir -p ${APP_DIR}
sudo chown $(whoami):$(whoami) ${APP_DIR}

# Clone or copy application code
if [ -d "${APP_DIR}/src" ]; then
    log_warning "Application code already exists in ${APP_DIR}"
else
    log_info "Setting up application code..."
    cd ${APP_DIR}
    
    # If running from the repository directory, copy files
    if [ -f "package.json" ]; then
        log_info "Copying application files from current directory..."
        cp package*.json ${APP_DIR}/
        cp -r src/ ${APP_DIR}/
    else
        log_info "Please copy your application files to ${APP_DIR}"
        log_info "Required files: package.json, package-lock.json, src/"
        log_warning "Setup will continue, but you need to copy files manually"
    fi
fi

# Install Node.js dependencies
if [ -f "${APP_DIR}/package.json" ]; then
    log_info "Installing Node.js dependencies..."
    cd ${APP_DIR}
    npm ci --production
else
    log_warning "package.json not found, skipping npm install"
fi

# Create environment file from secrets
log_info "Setting up environment variables from Google Secret Manager..."
cat > ${APP_DIR}/.env << 'EOF'
# HackScore AI Worker Environment Configuration
# These values are loaded from Google Cloud Secret Manager

NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Processing Configuration
MAX_TURNS_PER_ANALYSIS=200
ANALYSIS_TIMEOUT_MS=1800000
ESTIMATED_COST_PER_TOKEN=0.000003

# Claude Code SDK Configuration
NPM_CONFIG_PREFIX=/tmp/.npm-global
HOME=/tmp
TMPDIR=/tmp
NPM_CONFIG_CACHE=/tmp/.npm
NPM_CONFIG_UNSAFE_PERM=true
NODE_OPTIONS=--max-old-space-size=8192
XDG_CONFIG_HOME=/tmp/.config
EOF

# Create startup script that loads secrets
log_info "Creating startup script with secret loading..."
cat > ${APP_DIR}/start.sh << 'EOF'
#!/bin/bash

# HackScore AI Worker Startup Script
# This script loads secrets from Google Cloud Secret Manager and starts the worker

set -e

APP_DIR="/opt/hackscore-worker"
cd ${APP_DIR}

echo "🔑 Loading secrets from Google Cloud Secret Manager..."

# Load secrets and export as environment variables
export SUPABASE_URL=$(gcloud secrets versions access latest --secret='supabase-url' --project='hackscore-ai-production' 2>/dev/null || echo "")
export SUPABASE_SERVICE_ROLE_KEY=$(gcloud secrets versions access latest --secret='supabase-service-role-key' --project='hackscore-ai-production' 2>/dev/null || echo "")
export CLOUD_RUN_AUTH_TOKEN=$(gcloud secrets versions access latest --secret='cloud-run-auth-token' --project='hackscore-ai-production' 2>/dev/null || echo "")

# Validate required secrets
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ -z "$CLOUD_RUN_AUTH_TOKEN" ]; then
    echo "❌ Error: Failed to load required secrets from Secret Manager"
    echo "Required secrets: supabase-url, supabase-service-role-key, cloud-run-auth-token"
    exit 1
fi

echo "✅ Secrets loaded successfully"
echo "🚀 Starting HackScore AI Worker..."

# Start the application
exec node src/index.js
EOF

chmod +x ${APP_DIR}/start.sh

# Create systemd service file
log_info "Creating systemd service..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=HackScore AI Worker - GitHub Repository Analysis Service
Documentation=https://github.com/your-org/hackscore-ai
After=network.target

[Service]
Type=simple
User=nobody
Group=nogroup
WorkingDirectory=${APP_DIR}
ExecStart=${APP_DIR}/start.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}

# Environment
Environment=NODE_ENV=production
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
EOF

# Configure firewall
log_info "Configuring firewall rules..."
if ! gcloud compute firewall-rules describe allow-hackscore-worker &>/dev/null; then
    log_info "Creating firewall rule for port 8080..."
    gcloud compute firewall-rules create allow-hackscore-worker \
        --allow tcp:8080 \
        --source-ranges 0.0.0.0/0 \
        --description "Allow HackScore AI Worker HTTP traffic" \
        --project=${PROJECT_ID}
else
    log_info "Firewall rule already exists"
fi

# Enable and start the service
log_info "Enabling and starting systemd service..."
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}

# Check if the service is already running
if sudo systemctl is-active --quiet ${SERVICE_NAME}; then
    log_info "Service is already running, restarting..."
    sudo systemctl restart ${SERVICE_NAME}
else
    log_info "Starting service for the first time..."
    sudo systemctl start ${SERVICE_NAME}
fi

# Wait a moment for the service to start
sleep 5

# Check service status
log_info "Checking service status..."
sudo systemctl status ${SERVICE_NAME} --no-pager -l

# Get instance external IP
EXTERNAL_IP=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/external-ip" -H "Metadata-Flavor: Google")

# Test the service
log_info "Testing service health..."
if curl -s "http://localhost:8080/health" > /dev/null; then
    log_info "✅ Service is responding on localhost:8080"
    
    if curl -s "http://${EXTERNAL_IP}:8080/health" > /dev/null; then
        log_info "✅ Service is accessible externally at http://${EXTERNAL_IP}:8080"
    else
        log_warning "Service is not accessible externally. Check firewall rules."
    fi
else
    log_error "Service is not responding. Check logs with: sudo journalctl -u ${SERVICE_NAME} -f"
fi

# Final setup information
echo ""
echo -e "${GREEN}🎉 HackScore AI Worker setup completed!${NC}"
echo ""
echo -e "${BLUE}Service Information:${NC}"
echo -e "  Instance: ${INSTANCE_NAME}"
echo -e "  External IP: ${EXTERNAL_IP}"
echo -e "  Service URL: http://${EXTERNAL_IP}:8080"
echo -e "  Health Check: http://${EXTERNAL_IP}:8080/health"
echo ""
echo -e "${BLUE}Management Commands:${NC}"
echo -e "  Start service:   sudo systemctl start ${SERVICE_NAME}"
echo -e "  Stop service:    sudo systemctl stop ${SERVICE_NAME}"
echo -e "  Restart service: sudo systemctl restart ${SERVICE_NAME}"
echo -e "  View logs:       sudo journalctl -u ${SERVICE_NAME} -f"
echo -e "  Service status:  sudo systemctl status ${SERVICE_NAME}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "  1. Update CLOUD_RUN_WORKER_URL secret with: http://${EXTERNAL_IP}:8080"
echo -e "  2. Test the worker from your frontend application"
echo -e "  3. Monitor logs for any issues"
echo ""
echo -e "${YELLOW}Remember to update your frontend configuration with the new worker URL!${NC}" 