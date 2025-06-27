#!/bin/bash
# Deployment script for Cloud Run Worker

PROJECT_ID=${1:-"hackscore-ai-production"}
REGION=${2:-"asia-northeast1"}
SERVICE_NAME="hackscore-claudecode-worker"
IMAGE_NAME="asia-northeast1-docker.pkg.dev/$PROJECT_ID/hackscore-repo/$SERVICE_NAME:latest"

echo "🚀 Deploying HackScore ClaudeCode Worker to Cloud Run..."
echo "📊 Project ID: $PROJECT_ID"
echo "🌏 Region: $REGION"
echo "🔧 Service Name: $SERVICE_NAME"
echo "🐳 Image: $IMAGE_NAME"

# Build Docker image for Cloud Run platform (linux/amd64)
echo "🐳 Building Docker image for Cloud Run platform..."
docker buildx build --platform linux/amd64 -t $IMAGE_NAME .

echo "📦 Pushing image to Google Artifact Registry..."
docker push $IMAGE_NAME

# Deploy using existing deploy.yaml
echo "☁️ Deploying to Cloud Run using deploy.yaml..."
gcloud run services replace deploy.yaml \
    --region $REGION \
    --project $PROJECT_ID

echo "✅ Deployment completed!"
echo "🌐 Service URL: $(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)' --project $PROJECT_ID)"