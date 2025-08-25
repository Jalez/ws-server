# WebSocket Server Configuration

## Server Port

The WebSocket server runs on **port 3100** by default to avoid conflicts with your Vercel app on port 3000.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@host:port/database

# Server Configuration
PORT=3100
NODE_ENV=production

# CORS Configuration
CORS_ORIGIN=https://your-vercel-app.vercel.app

# JWT Configuration (if needed)
JWT_SECRET=your-jwt-secret-key

# Redis Configuration (OPTIONAL - not required for basic functionality)
REDIS_HOST=localhost
REDIS_PORT=6379

# Logging
LOG_LEVEL=info
```

## Running the Server

### Development (Local)
```bash
npm run dev
```

### Production (Local)
```bash
npm run build
npm start
```

### Docker (Recommended for Production)

#### Quick Start with Convenience Scripts

The easiest way to manage the WebSocket server in Docker:

```bash
# 1. Set your database connection
export DATABASE_URL="postgresql://username:password@host:port/database"

# 2. Start the server
./run-docker.sh

# 3. Check status anytime
./status-docker.sh

# 4. Restart the server (after code changes)
./restart-docker.sh

# 5. Quick log viewing (real-time)
./tail-logs.sh

# 6. Advanced monitoring and container access
./logs-docker.sh

# 7. Stop the server when done
./stop-docker.sh
```

#### Build and run with Docker Compose
```bash
# Set your database URL
export DATABASE_URL="postgresql://username:password@host:port/database"

# Build and start the container
docker-compose up --build

# Run in background
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

#### Environment Variables for Docker
Set these environment variables before running Docker:

```bash
export DATABASE_URL="postgresql://username:password@host:port/database"
export CORS_ORIGIN="https://your-vercel-app.vercel.app"
export JWT_SECRET="your-production-secret-key"
```

#### Docker Commands
```bash
# Build the image
docker build -t websocket-server .

# Run the container
docker run -p 3100:3100 \
  -e DATABASE_URL="postgresql://..." \
  -e CORS_ORIGIN="https://..." \
  --name websocket-server \
  websocket-server

# View logs
docker logs -f websocket-server

# Stop the container
docker stop websocket-server
```

#### Docker Management Scripts

**`./run-docker.sh`** - Start the WebSocket server
- Builds the Docker image if needed
- Starts containers in detached mode
- Performs health checks
- Provides status and management information

**`./restart-docker.sh`** - Restart the WebSocket server
- Restarts running containers gracefully
- If stopped, starts the containers
- Performs health checks after restart
- Useful after code changes

**`./tail-logs.sh`** - Quick real-time log viewer
- Immediately starts following logs
- Simple, no-menu interface
- Perfect for quick log checking
- Ctrl+C to exit

**`./logs-docker.sh`** - Advanced log monitoring
- Interactive menu with multiple options
- Real-time log following with timestamps
- Container shell access for debugging
- Log searching and resource monitoring

**`./status-docker.sh`** - Check server status
- Shows container status and resource usage
- Performs health checks
- Displays recent logs
- Provides management commands

**`./logs-docker.sh`** - Monitor logs and access container
- Interactive menu for log viewing options:
  - 📋 View logs in real-time (follow mode)
  - 📋 View last 100 or 500 lines
  - 🐚 Enter container shell for debugging
  - 📊 Show container resource usage
  - 🔍 Search logs for specific text
  - 📈 Monitor logs with timestamps

**`./stop-docker.sh`** - Stop the WebSocket server
- Stops containers gracefully
- Offers optional cleanup of resources
- Provides status after stopping

## WebSocket Message Format

The server expects messages in the following JSON format:

```typescript
interface WebSocketMessage {
  type: 'join-document' | 'leave-document' | 'document-change' | 'cursor-update' | 'user-presence';
  documentId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  data?: any;
}
```

## Database Schema

The server expects the following PostgreSQL tables to exist:

- `documents` - Document metadata
- `document_sessions` - Active user sessions
- `document_changes` - Document edit history
- `document_shares` - Document sharing permissions

## Architecture: Single Container

### Why a Single Container?

The WebSocket server is designed to run in a **single Docker container** with the following advantages:

✅ **Simple Deployment** - No complex orchestration needed
✅ **No External Dependencies** - Uses efficient in-memory storage
✅ **Cost Effective** - Lower resource usage
✅ **Easy Scaling** - Can run multiple instances behind a load balancer
✅ **Fast Startup** - Quick container initialization

### Storage Strategy

The server uses **in-memory data structures** for real-time operations:

- **Client Management** - JavaScript Maps for active connections
- **Document Rooms** - Efficient room-based message broadcasting
- **Session Tracking** - In-memory session storage with database persistence

This approach provides:
- **Better Performance** - No Redis network overhead
- **Lower Latency** - Direct memory access
- **Simplified Architecture** - One less service to manage
- **Perfect for Collaboration** - Real-time operations are memory-bound

### When to Add Redis

Redis would be beneficial if you need:
- **Multi-instance scaling** across multiple servers
- **Session persistence** across server restarts
- **Additional caching** for database queries
- **Pub/sub messaging** between server instances

For most collaboration applications, the in-memory approach is sufficient and more performant.

## Deployment

The server is designed to work with deployment platforms like:
- Railway
- Render
- DigitalOcean
- Heroku

Make sure to set the `DATABASE_URL` environment variable to point to your PostgreSQL instance.
