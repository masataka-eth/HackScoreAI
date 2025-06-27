#!/bin/bash
set -e

# Log all output
exec > >(tee -a /var/log/startup-script.log)
exec 2>&1

echo "=== HackScore Worker Startup Script ==="
date

# Install required packages
echo "=== Installing required packages ==="
apt-get update
apt-get install -y curl

# Configure Docker authentication for Artifact Registry
echo "=== Configuring Docker for Artifact Registry ==="
gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet

# Create directories
echo "=== Creating persistent directories ==="
mkdir -p /opt/hackscore/secrets
mkdir -p /opt/hackscore/npm-cache
mkdir -p /opt/hackscore/config
chmod 755 /opt/hackscore/secrets

# Fetch secrets from Secret Manager
echo "=== Fetching secrets from Secret Manager ==="
gcloud secrets versions access latest --secret="SUPABASE_URL" > /opt/hackscore/secrets/supabase_url
gcloud secrets versions access latest --secret="SUPABASE_SERVICE_ROLE_KEY" > /opt/hackscore/secrets/supabase_key
gcloud secrets versions access latest --secret="CLOUD_RUN_AUTH_TOKEN" > /opt/hackscore/secrets/auth_token

# Pull latest image
echo "=== Pulling Docker Image ==="
docker pull asia-northeast1-docker.pkg.dev/hackscore-ai-production/hackscore-repo/hackscore-claudecode-worker:latest

# Stop and remove existing container if exists
echo "=== Cleaning up existing container ==="
docker stop hackscore-worker-container 2>/dev/null || true
docker rm hackscore-worker-container 2>/dev/null || true

# Start container
echo "=== Starting HackScore Worker Container ==="
docker run -d \
  --name hackscore-worker-container \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /opt/hackscore/secrets:/opt/secrets:ro \
  -v /opt/hackscore/npm-cache:/tmp/.npm-global \
  -v /opt/hackscore/config:/tmp/.config \
  -e SUPABASE_URL="$(cat /opt/hackscore/secrets/supabase_url)" \
  -e SUPABASE_SERVICE_ROLE_KEY="$(cat /opt/hackscore/secrets/supabase_key)" \
  -e CLOUD_RUN_AUTH_TOKEN="$(cat /opt/hackscore/secrets/auth_token)" \
  -e NODE_ENV=production \
  -e MAX_TURNS_PER_ANALYSIS=200 \
  -e ANALYSIS_TIMEOUT_MS=1800000 \
  -e LOG_LEVEL=info \
  -e NPM_CONFIG_PREFIX=/tmp/.npm-global \
  -e PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/tmp/.npm-global/bin" \
  -e HOME=/tmp \
  -e TMPDIR=/tmp \
  -e NPM_CONFIG_CACHE=/tmp/.npm \
  -e NPM_CONFIG_UNSAFE_PERM=true \
  -e NODE_OPTIONS="--max-old-space-size=8192" \
  -e XDG_CONFIG_HOME=/tmp/.config \
  asia-northeast1-docker.pkg.dev/hackscore-ai-production/hackscore-repo/hackscore-claudecode-worker:latest

# Wait for container to start
echo "=== Waiting for container startup ==="
sleep 30

# Check container status
echo "=== Container Status ==="
docker ps

# Show logs
echo "=== Container Logs ==="
docker logs --tail 50 hackscore-worker-container

# Health check
echo "=== Health Check ==="
curl -s http://localhost:8080/health || echo "Health check failed - container may still be starting"

echo "=== Startup Complete ==="
echo "$(date): HackScore Worker container started successfully" 