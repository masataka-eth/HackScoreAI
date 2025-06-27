#!/bin/bash
set -e

echo "=== HackScore Worker Container Setup ==="
echo "Setting up Docker container on Compute Engine..."

# Docker version check
echo "=== Docker Version Check ==="
docker --version

# Pull latest image
echo "=== Pulling Docker Image ==="
docker pull asia-northeast1-docker.pkg.dev/hackscore-ai-production/hackscore-repo/hackscore-claudecode-worker:latest

# Stop and remove existing container if exists
echo "=== Cleaning up existing container ==="
docker stop hackscore-worker-container 2>/dev/null || true
docker rm hackscore-worker-container 2>/dev/null || true

# Create secrets directory
echo "=== Creating secrets directory ==="
sudo mkdir -p /var/secrets
sudo chown $(whoami):$(whoami) /var/secrets

# Fetch secrets from Secret Manager
echo "=== Fetching secrets from Secret Manager ==="
gcloud secrets versions access latest --secret="SUPABASE_URL" > /var/secrets/supabase_url
gcloud secrets versions access latest --secret="SUPABASE_SERVICE_ROLE_KEY" > /var/secrets/supabase_key
gcloud secrets versions access latest --secret="CLOUD_RUN_AUTH_TOKEN" > /var/secrets/auth_token

# Start container with persistent volumes
echo "=== Starting Container ==="
docker run -d \
  --name hackscore-worker-container \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /var/secrets:/var/secrets:ro \
  -v /home/docker_user/npm-cache:/tmp/.npm-global \
  -v /home/docker_user/config:/tmp/.config \
  -e SUPABASE_URL="$(cat /var/secrets/supabase_url)" \
  -e SUPABASE_SERVICE_ROLE_KEY="$(cat /var/secrets/supabase_key)" \
  -e CLOUD_RUN_AUTH_TOKEN="$(cat /var/secrets/auth_token)" \
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

echo "=== Container Status ==="
docker ps

echo "=== Container Logs (Last 20 lines) ==="
docker logs --tail 20 hackscore-worker-container

echo "=== Health Check ==="
sleep 10
curl -s http://localhost:8080/health || echo "Health check failed - container may still be starting"

echo "=== Setup Complete ==="
echo "External URL: http://34.146.180.201:8080"
echo "Health Check: http://34.146.180.201:8080/health"
echo "Process Endpoint: http://34.146.180.201:8080/process" 