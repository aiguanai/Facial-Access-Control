#!/bin/bash
# Stop all running services

echo "Stopping all services..."

# Kill processes on service ports
for port in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3011 3012; do
    pid=$(lsof -ti:$port 2>/dev/null || fuser $port/tcp 2>/dev/null | awk '{print $1}')
    if [ ! -z "$pid" ]; then
        echo "Killing process on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
    fi
done

# Kill node processes (tsx watch)
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "uvicorn" 2>/dev/null || true

echo "✅ All services stopped"

