#!/bin/bash

echo "🛑 Stopping HackScore AI Development Environment..."

# Kill processes by PID files
if [ -f /tmp/edge-functions.pid ]; then
    EDGE_PID=$(cat /tmp/edge-functions.pid)
    if kill -0 $EDGE_PID 2>/dev/null; then
        echo "🔪 Stopping Edge Functions (PID: $EDGE_PID)..."
        kill $EDGE_PID
    fi
    rm -f /tmp/edge-functions.pid
fi

if [ -f /tmp/worker.pid ]; then
    WORKER_PID=$(cat /tmp/worker.pid)
    if kill -0 $WORKER_PID 2>/dev/null; then
        echo "🔪 Stopping Cloud Run Worker (PID: $WORKER_PID)..."
        kill $WORKER_PID
    fi
    rm -f /tmp/worker.pid
fi

# Kill by process name as backup
echo "🧹 Cleaning up remaining processes..."
pkill -f "supabase functions serve" 2>/dev/null || true
pkill -f "cloud-run-worker" 2>/dev/null || true

# Clean up log files
rm -f /tmp/edge-functions.log /tmp/worker.log

echo "✅ All services stopped"