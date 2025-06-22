#!/bin/bash
# Deployment script for Cloud Run Worker

PROJECT_ID=${1:-"your-project-id"}
REGION=${2:-"asia-northeast1"}
SERVICE_NAME="hackscore-claudecode-worker"

echo "🚀 Deploying HackScore ClaudeCode Worker to Cloud Run..."
echo "📊 Project ID: $PROJECT_ID"
echo "🌏 Region: $REGION"
echo "🔧 Service Name: $SERVICE_NAME"

# Build and push Docker image
echo "🐳 Building Docker image..."
docker build -t gcr.io/$PROJECT_ID/$SERVICE_NAME .

echo "📦 Pushing image to Google Container Registry..."
docker push gcr.io/$PROJECT_ID/$SERVICE_NAME

# Deploy to Cloud Run
echo "☁️ Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 1 \
    --timeout 300s \
    --max-instances 10 \
    --min-instances 0 \
    --concurrency 1000 \
    --set-env-vars NODE_ENV=production,PORT=8080,LOG_LEVEL=info \
    --project $PROJECT_ID

echo "✅ Deployment completed!"
echo "🌐 Service URL: $(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')"