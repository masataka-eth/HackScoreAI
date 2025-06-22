#!/bin/bash
# Development script for Cloud Run Worker

echo "🚀 Starting HackScore ClaudeCode Worker in development mode..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start development server
echo "🔧 Starting development server..."
npm run dev