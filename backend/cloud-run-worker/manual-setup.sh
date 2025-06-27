#!/bin/bash
# Manual setup script for SSH execution

echo "=== Manual HackScore Worker Setup ==="

# Configure Docker for Artifact Registry
gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet

# Pull image
docker pull asia-northeast1-docker.pkg.dev/hackscore-ai-production/hackscore-repo/hackscore-claudecode-worker:latest

# Create secrets
mkdir -p /tmp/secrets
gcloud secrets versions access latest --secret="SUPABASE_URL" > /tmp/secrets/supabase_url
gcloud secrets versions access latest --secret="SUPABASE_SERVICE_ROLE_KEY" > /tmp/secrets/supabase_key
gcloud secrets versions access latest --secret="CLOUD_RUN_AUTH_TOKEN" > /tmp/secrets/auth_token

# Stop existing container
docker stop hackscore-worker-container 2>/dev/null || true
docker rm hackscore-worker-container 2>/dev/null || true

# Start container
docker run -d \
  --name hackscore-worker-container \
  --restart unless-stopped \
  -p 8080:8080 \
  -e SUPABASE_URL="$(cat /tmp/secrets/supabase_url)" \
  -e SUPABASE_SERVICE_ROLE_KEY="$(cat /tmp/secrets/supabase_key)" \
  -e CLOUD_RUN_AUTH_TOKEN="$(cat /tmp/secrets/auth_token)" \
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

echo "=== Setup Complete ==="
docker ps
docker logs --tail 20 hackscore-worker-container 