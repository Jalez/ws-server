#!/bin/bash

# WebSocket Server Docker Stopper
# This script stops the WebSocket server containers and cleans up resources

echo "🛑 Stopping WebSocket Server..."

# Check for processes using port 3100
echo "🔍 Checking for processes using port 3100..."
PORT_PROCESS=$(lsof -i :3100 -t 2>/dev/null)

if [ ! -z "$PORT_PROCESS" ]; then
    echo "⚠️  Found process(es) using port 3100:"
    lsof -i :3100
    echo ""

    read -p "🛑 Would you like to stop the process(es) using port 3100? (y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🛑 Force killing process(es) using port 3100..."
        for PID in $PORT_PROCESS; do
            if kill -KILL "$PID" 2>/dev/null; then
                echo "   ✅ Process $PID force killed"
            else
                echo "   ❌ Failed to kill process $PID"
            fi
        done
        echo "✅ Port 3100 cleanup completed!"
        sleep 1  # Brief pause to ensure cleanup
    else
        echo "ℹ️  Leaving process(es) running on port 3100"
    fi
    echo ""
else
    echo "✅ No processes found using port 3100"
    echo ""
fi

# Check if containers are running
if ! docker-compose ps | grep -q "Up"; then
    echo "ℹ️  No running containers found. The server may already be stopped."
    echo "   Current container status:"
    docker-compose ps
    echo ""
    echo "✅ No action needed - server is already stopped."
    exit 0
fi

echo "📊 Current container status:"
docker-compose ps
echo ""

# Stop the containers gracefully
echo "🏗️  Stopping containers gracefully..."
docker-compose down

echo ""
echo "✅ WebSocket server stopped successfully!"
echo ""
echo "📋 Container status after stopping:"
docker-compose ps
echo ""

# Optional cleanup
read -p "🧹 Would you like to clean up Docker resources? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Cleaning up Docker resources..."

    # Remove containers
    echo "   Removing containers..."
    docker-compose down --volumes --remove-orphans

    # Remove images (optional)
    read -p "   Remove Docker images as well? (y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "   Removing images..."
        docker image rm websocket-server-test 2>/dev/null || true
        docker image rm web-socket-api_websocket-server 2>/dev/null || true
        echo "   ✅ Images removed"
    fi

    echo "✅ Cleanup completed!"
else
    echo "ℹ️  Containers stopped but not removed. Use 'docker-compose up' to restart."
fi

echo ""
echo "🎯 Useful commands:"
echo "   🔄 Restart server: ./run-docker.sh"
echo "   📋 View logs: docker-compose logs -f"
echo "   🔍 Check status: docker-compose ps"

