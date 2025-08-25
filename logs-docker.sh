#!/bin/bash

# WebSocket Server Docker Logs and Shell Access
# This script provides real-time log viewing and shell access to the container

echo "📋 WebSocket Server Docker Logs & Shell Access"
echo "=============================================="

# Check if containers exist
if ! docker-compose ps -q > /dev/null 2>&1; then
    echo "❌ No containers found. The server may not be running."
    echo "   Use './run-docker.sh' to start the server first."
    exit 1
fi

# Show current container status
echo "📊 Current container status:"
docker-compose ps
echo ""

# Function to show menu
show_menu() {
    echo "🔧 Choose an option:"
    echo "  1) 📋 View logs (follow mode)"
    echo "  2) 📋 View last 100 lines"
    echo "  3) 📋 View last 500 lines"
    echo "  4) 🐚 Enter container shell"
    echo "  5) 📊 Show container resource usage"
    echo "  6) 🔍 Search logs for specific text"
    echo "  7) 📈 Monitor logs with timestamps"
    echo "  8) ❌ Exit"
    echo ""
    echo -n "Enter your choice (1-8): "
}

# Function to check if container is running
check_container() {
    if ! docker-compose ps | grep -q "Up"; then
        echo "❌ Container is not running. Please start it first."
        return 1
    fi
    return 0
}

# Main loop
while true; do
    show_menu
    read -r choice

    case $choice in
        1)
            echo "📋 Following logs in real-time (Ctrl+C to stop)..."
            echo "=================================================="
            docker-compose logs -f
            echo ""
            ;;
        2)
            if check_container; then
                echo "📋 Last 100 lines of logs:"
                echo "=========================="
                docker-compose logs --tail=100
                echo ""
            fi
            ;;
        3)
            if check_container; then
                echo "📋 Last 500 lines of logs:"
                echo "=========================="
                docker-compose logs --tail=500
                echo ""
            fi
            ;;
        4)
            if check_container; then
                echo "🐚 Entering container shell..."
                echo "============================="
                echo "Tip: Use 'exit' to leave the shell"
                echo ""
                docker-compose exec websocket-server /bin/sh
                echo ""
            else
                echo "❌ Cannot enter shell - container not running"
            fi
            ;;
        5)
            if check_container; then
                echo "📊 Container resource usage:"
                echo "============================"
                docker stats --no-stream $(docker-compose ps -q)
                echo ""
            fi
            ;;
        6)
            if check_container; then
                echo -n "🔍 Enter text to search for in logs: "
                read -r search_term
                if [ -n "$search_term" ]; then
                    echo "🔍 Searching logs for: '$search_term'"
                    echo "======================================"
                    docker-compose logs | grep -i "$search_term"
                    echo ""
                else
                    echo "❌ No search term provided"
                fi
            fi
            ;;
        7)
            if check_container; then
                echo "📈 Monitoring logs with timestamps (Ctrl+C to stop)..."
                echo "======================================================"
                docker-compose logs -f -t
                echo ""
            fi
            ;;
        8)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo "❌ Invalid option. Please choose 1-8."
            echo ""
            ;;
    esac

    # Add a pause for better UX
    if [ "$choice" != "8" ]; then
        echo "Press Enter to continue..."
        read -r
    fi

done

