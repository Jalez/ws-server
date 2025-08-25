#!/bin/bash

# WebSocket Server Docker Runner
# This script helps you run the WebSocket server in Docker

echo "🚀 Starting WebSocket Server in Docker..."

# Load .env file if it exists
if [ -f .env ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
fi

# Check if DATABASE_URL is set (after loading .env)
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL is not set in .env file. Using example value for demonstration."
    echo "   Set your actual DATABASE_URL in the .env file before running in production."
    export DATABASE_URL="postgresql://postgres:password@host.docker.internal:5432/websocket_db"
fi

# Set default values for other environment variables
export CORS_ORIGIN=${CORS_ORIGIN:-"http://localhost:3000"}
export JWT_SECRET=${JWT_SECRET:-"development-secret-key"}
export SKIP_DB_AUTH=${SKIP_DB_AUTH:-"false"}

echo "📊 Environment Configuration:"
echo "   DATABASE_URL: $DATABASE_URL"
echo "   CORS_ORIGIN: $CORS_ORIGIN"
echo "   SKIP_DB_AUTH: $SKIP_DB_AUTH"
echo "   PORT: 3100"
echo ""

# Run with Docker Compose (recommended)
echo "🏗️  Building and starting with Docker Compose..."
docker-compose up --build -d

echo ""
echo "⏳ Waiting for containers to start..."
sleep 3

# Check if containers started successfully
if docker-compose ps | grep -q "Up"; then
    echo "✅ WebSocket server started successfully!"
    echo ""
    echo "📊 Container Status:"
    docker-compose ps
    echo ""
    echo "🌐 Access Points:"
    echo "   🌐 WebSocket endpoint: ws://localhost:3100"
    echo "   🏥 Health check: http://localhost:3100/health"
    echo ""
    echo "📋 Management Commands:"
    echo "   📋 View logs: docker-compose logs -f"
    echo "   📋 View logs (last 100 lines): docker-compose logs --tail=100"
    echo "   🛑 Stop server: ./stop-docker.sh"
    echo "   🔄 Restart server: docker-compose restart"
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
    echo "❌ Failed to start containers. Checking logs..."
    docker-compose logs
    echo ""
    echo "🔍 Troubleshooting:"
    echo "   Check Docker daemon: docker info"
    echo "   Check logs: docker-compose logs"
    echo "   Clean restart: ./stop-docker.sh && ./run-docker.sh"
fi

# Optional: Run directly with docker run (uncomment if preferred)
# echo "🏗️  Running with Docker directly..."
# docker run -d \
#   --name websocket-server \
#   -p 3100:3100 \
#   -e DATABASE_URL="$DATABASE_URL" \
#   -e CORS_ORIGIN="$CORS_ORIGIN" \
#   -e JWT_SECRET="$JWT_SECRET" \
#   -e NODE_ENV=production \
#   -e PORT=3100 \
#   websocket-server
