#!/bin/bash

# HackScore AI Development Start Script
echo "🚀 Starting HackScore AI Development Environment..."

# Check if we're in the correct directory
if [ ! -f "supabase/config.toml" ]; then
    echo "❌ Please run this script from the backend directory"
    exit 1
fi

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Kill existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f "supabase functions serve" 2>/dev/null || true
pkill -f "cloud-run-worker" 2>/dev/null || true
sleep 2

# Start Cloud Run Worker
echo "🏗️ Starting Cloud Run Worker..."
cd cloud-run-worker

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Cloud Run Worker dependencies..."
    npm install
fi

# Find available port for Cloud Run Worker
WORKER_PORT=8082
while check_port $WORKER_PORT; do
    echo "⚠️ Port $WORKER_PORT is in use, trying next port..."
    WORKER_PORT=$((WORKER_PORT + 1))
done

echo "🌐 Starting Cloud Run Worker on port $WORKER_PORT..."
PORT=$WORKER_PORT npm run dev > /tmp/worker.log 2>&1 &
WORKER_PID=$!
echo $WORKER_PID > /tmp/worker.pid

# Wait for worker to start
echo "⏳ Waiting for Cloud Run Worker to start..."
sleep 5

# Check if worker is running
if ! curl -s "http://localhost:$WORKER_PORT/health" > /dev/null; then
    echo "❌ Failed to start Cloud Run Worker"
    cat /tmp/worker.log
    exit 1
fi

echo "✅ Cloud Run Worker is running on port $WORKER_PORT"

# Update environment variables
cd ..
echo "🔧 Updating environment variables..."
sed -i.bak "s|CLOUD_RUN_WORKER_URL=.*|CLOUD_RUN_WORKER_URL=http://localhost:$WORKER_PORT|" supabase/.env

# Start Supabase Edge Functions
echo "🚀 Starting Supabase Edge Functions..."
supabase functions serve --debug > /tmp/edge-functions.log 2>&1 &
EDGE_PID=$!
echo $EDGE_PID > /tmp/edge-functions.pid

# Wait for Edge Functions to start
echo "⏳ Waiting for Edge Functions to start..."
sleep 10

# Check if Edge Functions are running
if ! curl -s "http://127.0.0.1:54321/functions/v1/enqueue" > /dev/null; then
    echo "❌ Failed to start Edge Functions"
    cat /tmp/edge-functions.log
    exit 1
fi

echo "✅ Edge Functions are running"

# Test the integration
echo "🧪 Testing integration..."
curl -X GET "http://127.0.0.1:54321/functions/v1/enqueue" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  2>/dev/null | jq .

curl -X GET "http://127.0.0.1:54321/functions/v1/repo_worker" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  2>/dev/null | jq .

echo ""
echo "🎉 Development environment is ready!"
echo "📊 Services Status:"
echo "   - Supabase: http://127.0.0.1:54321"
echo "   - Cloud Run Worker: http://localhost:$WORKER_PORT"
echo "   - Studio: http://127.0.0.1:54323"
echo ""
echo "📝 Logs:"
echo "   - Edge Functions: tail -f /tmp/edge-functions.log"
echo "   - Cloud Run Worker: tail -f /tmp/worker.log"
echo ""
echo "⏹️ To stop all services:"
echo "   - kill \$(cat /tmp/edge-functions.pid) \$(cat /tmp/worker.pid)"
echo ""

# Keep script running
echo "🔄 Monitoring services... (Press Ctrl+C to stop)"
trap 'echo "🛑 Stopping services..."; kill $(cat /tmp/edge-functions.pid 2>/dev/null) $(cat /tmp/worker.pid 2>/dev/null) 2>/dev/null; rm -f /tmp/*.pid /tmp/*.log; exit 0' INT

while true; do
    sleep 10
    # Check if services are still running
    if ! kill -0 $WORKER_PID 2>/dev/null || ! kill -0 $EDGE_PID 2>/dev/null; then
        echo "❌ One of the services has stopped. Check logs:"
        echo "   - Edge Functions: cat /tmp/edge-functions.log"
        echo "   - Cloud Run Worker: cat /tmp/worker.log"
        break
    fi
done