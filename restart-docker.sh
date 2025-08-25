#!/bin/bash

# WebSocket Server Docker Restarter
# This script restarts the WebSocket server containers

echo "🔄 Restarting WebSocket Server..."

# Check if containers exist
if ! docker-compose ps -q > /dev/null 2>&1; then
    echo "❌ No containers found. The server may not be running."
    echo "   Use './run-docker.sh' to start the server first."
    exit 1
fi

echo "📊 Current container status:"
docker-compose ps
echo ""

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo "🏗️  Restarting running containers..."
    docker-compose restart

    echo ""
    echo "⏳ Waiting for restart to complete..."
    sleep 3

    # Verify restart was successful
    if docker-compose ps | grep -q "Up"; then
        echo "✅ WebSocket server restarted successfully!"
        echo ""
        echo "📊 Container Status After Restart:"
        docker-compose ps
        echo ""
        echo "🌐 Access Points:"
        echo "   🌐 WebSocket endpoint: ws://localhost:3100"
        echo "   🏥 Health check: http://localhost:3100/health"
        echo ""
        echo "🔍 Health Check:"
        echo "   Testing health endpoint..."
        sleep 2
        if curl -s http://localhost:3100/health > /dev/null 2>&1; then
            echo "   ✅ Health check passed!"
        else
            echo "   ⚠️  Health check failed - server may still be starting up"
            echo "   Try: curl http://localhost:3100/health"
        fi
    else
        echo "❌ Failed to restart containers. Checking logs..."
        docker-compose logs --tail=20
    fi
else
    echo "ℹ️  Containers are stopped. Starting them instead..."
    echo ""

    # Check if DATABASE_URL is set
    if [ -z "$DATABASE_URL" ]; then
        echo "⚠️  DATABASE_URL is not set. Using example value for demonstration."
        echo "   Set your actual DATABASE_URL before running in production:"
        echo "   export DATABASE_URL='postgresql://username:password@host:port/database'"
        export DATABASE_URL="postgresql://postgres:password@host.docker.internal:5432/websocket_db"
    fi

    # Set default values for other environment variables
    export CORS_ORIGIN=${CORS_ORIGIN:-"http://localhost:3000"}
    export JWT_SECRET=${JWT_SECRET:-"development-secret-key"}

    echo "🏗️  Starting containers..."
    docker-compose up -d

    echo ""
    echo "⏳ Waiting for containers to start..."
    sleep 3

    if docker-compose ps | grep -q "Up"; then
        echo "✅ WebSocket server started successfully!"
        echo ""
        echo "📊 Container Status:"
        docker-compose ps
    else
        echo "❌ Failed to start containers. Checking logs..."
        docker-compose logs
    fi
fi

echo ""
echo "📋 Management Commands:"
echo "   📋 View logs: docker-compose logs -f"
echo "   📋 View logs (last 100 lines): docker-compose logs --tail=100"
echo "   🛑 Stop server: ./stop-docker.sh"
echo "   🔄 Restart server: ./restart-docker.sh"

