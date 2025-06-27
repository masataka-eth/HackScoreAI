#!/bin/bash

# HackScore AI Worker - Cloud Run Deployment Script
# Deploys the worker service to Google Cloud Run

set -e

# Configuration
PROJECT_ID=${1:-"hackscore-ai-production"}
REGION=${2:-"asia-northeast1"}
SERVICE_NAME="hackscore-ai-worker"
IMAGE_NAME="asia-northeast1-docker.pkg.dev/$PROJECT_ID/hackscore-repo/$SERVICE_NAME:latest"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Deploying HackScore AI Worker to Cloud Run...${NC}"
echo -e "${YELLOW}📊 Project ID: $PROJECT_ID${NC}"
echo -e "${YELLOW}🌏 Region: $REGION${NC}"
echo -e "${YELLOW}🔧 Service Name: $SERVICE_NAME${NC}"
echo -e "${YELLOW}🐳 Image: $IMAGE_NAME${NC}"
echo ""

# Verify gcloud authentication
echo -e "${BLUE}🔐 Verifying authentication...${NC}"
gcloud auth list --filter=status:ACTIVE --format="value(account)" || {
    echo "❌ Please authenticate with: gcloud auth login"
    exit 1
}

# Set project
echo -e "${BLUE}📋 Setting project...${NC}"
gcloud config set project $PROJECT_ID

# Build Docker image for Cloud Run platform (linux/amd64)
echo -e "${BLUE}🐳 Building Docker image for Cloud Run platform...${NC}"
docker buildx build --platform linux/amd64 -t $IMAGE_NAME .

# Push image to Artifact Registry
echo -e "${BLUE}📦 Pushing image to Google Artifact Registry...${NC}"
docker push $IMAGE_NAME

# Deploy using existing deploy.yaml
echo -e "${BLUE}☁️ Deploying to Cloud Run using deploy.yaml...${NC}"
gcloud run services replace deploy.yaml \
    --region $REGION \
    --project $PROJECT_ID

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)' --project $PROJECT_ID 2>/dev/null || echo "Not found")

echo ""
echo -e "${GREEN}✅ Deployment completed!${NC}"
echo -e "${GREEN}🌐 Service URL: $SERVICE_URL${NC}"
echo -e "${GREEN}🏥 Health Check: $SERVICE_URL/health${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Test the deployment: curl $SERVICE_URL/health"
echo -e "  2. Update frontend configuration with the new URL"
echo -e "  3. Monitor logs: gcloud logging read \"resource.type=cloud_run_revision\" --project=$PROJECT_ID"