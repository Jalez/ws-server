#!/bin/bash

# Quick Log Viewer for WebSocket Server
# Simple script to tail logs in real-time

# Check if containers exist
if ! docker-compose ps -q > /dev/null 2>&1; then
    echo "❌ No containers found. The server may not be running."
    echo "   Use './run-docker.sh' to start the server first."
    exit 1
fi

# Check if container is running
if ! docker-compose ps | grep -q "Up"; then
    echo "❌ Container is not running."
    echo "   Use './run-docker.sh' to start the server."
    exit 1
fi

echo "📋 WebSocket Server Logs (Real-time)"
echo "===================================="
echo "Press Ctrl+C to stop following logs"
echo ""

# Follow logs in real-time
docker-compose logs -f

