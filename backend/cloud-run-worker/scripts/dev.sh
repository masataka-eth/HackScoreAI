#!/bin/bash

# HackScore AI Worker - Development Script
# Sets up and runs the worker in development mode

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting HackScore AI Worker in Development Mode${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18 or higher.${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js version: $NODE_VERSION${NC}"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating template...${NC}"
    cat > .env << 'EOF'
# HackScore AI Worker Environment Variables
# Copy this template and fill in your actual values

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CLOUD_RUN_AUTH_TOKEN=your_auth_token

# Optional Configuration
NODE_ENV=development
PORT=8080
LOG_LEVEL=debug
MAX_TURNS_PER_ANALYSIS=50
ANALYSIS_TIMEOUT_MS=300000

# Claude Code SDK Development Configuration
NPM_CONFIG_PREFIX=/tmp/.npm-global
HOME=/tmp
TMPDIR=/tmp
NPM_CONFIG_CACHE=/tmp/.npm
NPM_CONFIG_UNSAFE_PERM=true
NODE_OPTIONS=--max-old-space-size=4096
XDG_CONFIG_HOME=/tmp/.config
EOF
    echo -e "${RED}❌ Please edit .env file with your actual values before running the worker.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Environment file found${NC}"

# Create necessary directories
mkdir -p /tmp/.npm-global /tmp/.config
echo -e "${GREEN}✅ Created temporary directories${NC}"

echo ""
echo -e "${BLUE}🏃‍♂️ Starting development server with file watching...${NC}"
echo -e "${YELLOW}🌐 Server will be available at: http://localhost:8080${NC}"
echo -e "${YELLOW}🏥 Health check: http://localhost:8080/health${NC}"
echo -e "${YELLOW}🧪 Test endpoint: http://localhost:8080/test${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""

# Start the development server with file watching
npm run dev