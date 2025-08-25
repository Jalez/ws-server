#!/bin/bash

# WebSocket Server Docker Status Checker
# This script shows the current status of the WebSocket server containers

echo "📊 WebSocket Server Docker Status"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running or not accessible"
    echo "   Please start Docker Desktop or check Docker daemon status"
    exit 1
fi

echo ""

# Container status
echo "🏗️  Container Status:"
docker-compose ps
echo ""

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Status: WebSocket server is RUNNING"
    echo ""

    # Show resource usage
    echo "📈 Resource Usage:"
    docker stats --no-stream $(docker-compose ps -q) 2>/dev/null | head -n 2
    echo ""

    # Health check
    echo "🏥 Health Check:"
    if curl -s http://localhost:3100/health > /dev/null 2>&1; then
        echo "   ✅ Health endpoint responding"
        # Get health response
        HEALTH_RESPONSE=$(curl -s http://localhost:3100/health)
        echo "   📋 Response: $HEALTH_RESPONSE"
    else
        echo "   ❌ Health endpoint not responding"
        echo "   🔍 Check logs: docker-compose logs -f"
    fi
    echo ""

    # Show recent logs
    echo "📋 Recent Logs (last 5 lines):"
    docker-compose logs --tail=5
    echo ""

    echo "🌐 Access Information:"
    echo "   🌐 WebSocket endpoint: ws://localhost:3100"
    echo "   🏥 Health check: http://localhost:3100/health"
    echo ""
    echo "📋 Management Commands:"
    echo "   🛑 Stop server: ./stop-docker.sh"
    echo "   📋 View full logs: docker-compose logs -f"
    echo "   🔄 Restart: docker-compose restart"

else
    echo "⏹️  Status: WebSocket server is STOPPED"
    echo ""
    echo "📋 Management Commands:"
    echo "   🚀 Start server: ./run-docker.sh"
    echo "   📋 View logs: docker-compose logs"
fi

echo ""
echo "🔧 Docker Information:"
echo "   Docker version: $(docker --version)"
echo "   Compose version: $(docker-compose --version)"

