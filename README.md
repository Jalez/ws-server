# WebSocket Document Collaboration Server

A high-performance WebSocket server built with Socket.io and Express.js for real-time document collaboration. Supports multiple users editing documents simultaneously with operational transformation, user presence tracking, and scalable architecture.

## Features

- **Real-time Collaboration**: Multiple users can edit documents simultaneously
- **Operational Transformation**: Conflict-free replicated data types for text editing
- **User Presence**: Track cursor positions and user activity
- **Authentication**: JWT-based authentication with role-based permissions
- **Rate Limiting**: Built-in protection against abuse
- **Scalable Architecture**: Redis adapter for horizontal scaling
- **Comprehensive Logging**: Winston-based logging with correlation IDs
- **Health Monitoring**: Built-in health check endpoints

## Quick Start

### Prerequisites

- Node.js 18+
- Redis (for scaling)
- PostgreSQL (for permissions - optional)

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd web-socket-api
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Redis (if running locally):**
   ```bash
   redis-server
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

The server will start on `http://localhost:3000` with WebSocket support.

## Environment Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `FRONTEND_URL` | Frontend application URL | `http://localhost:3000` |
| `JWT_SECRET` | JWT signing secret | Required |
| `REDIS_HOST` | Redis server host | `localhost` |
| `REDIS_PORT` | Redis server port | `6379` |
| `LOG_LEVEL` | Logging level | `info` |

## API Documentation

### Socket.io Events

#### Authentication

**Client → Server:**
```javascript
// Authenticate with JWT token
socket.auth = { token: 'your-jwt-token' };
socket.connect();
```

#### Document Operations

**Join Document:**
```javascript
socket.emit('join_document', {
  documentId: 'doc_123456789',
  permissions: 'editor' // 'owner', 'editor', 'viewer'
});
```

**Text Edit Operations:**
```javascript
socket.emit('text_edit', {
  documentId: 'doc_123456789',
  operation: {
    type: 'insert', // 'insert', 'delete', 'update'
    position: 42,
    content: 'Hello World',
    version: 15
  }
});
```

**Cursor Updates:**
```javascript
socket.emit('cursor_update', {
  documentId: 'doc_123456789',
  cursor: { position: 156 },
  selection: { start: 150, end: 162 }
});
```

**Request Document Sync:**
```javascript
socket.emit('sync_request', {
  documentId: 'doc_123456789'
});
```

#### Server → Client Events

**Document State:**
```javascript
socket.on('document_state', (data) => {
  console.log('Document:', data);
  // { documentId, content, version, timestamp }
});
```

**Text Edit Updates:**
```javascript
socket.on('text_edit', (data) => {
  console.log('Text edit:', data);
  // { type, documentId, userId, userName, operation, timestamp }
});
```

**User Presence:**
```javascript
socket.on('cursor_update', (data) => {
  console.log('Cursor update:', data);
  // { type, documentId, userId, userName, action, cursor, selection, timestamp }
});
```

**User Events:**
```javascript
socket.on('user_joined', (data) => {
  console.log('User joined:', data);
  // { userId, userName, timestamp }
});

socket.on('user_left', (data) => {
  console.log('User left:', data);
  // { userId, userName, timestamp }
});
```

**Errors:**
```javascript
socket.on('error', (error) => {
  console.error('Error:', error);
  // { type, message }
});
```

### HTTP Endpoints

#### Health Check
```
GET /health
```
Returns server status and connection count.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1640995200000,
  "connections": 42
}
```

## Client Integration Example

```javascript
import io from 'socket.io-client';

class DocumentCollaboration {
  constructor(documentId, token) {
    this.documentId = documentId;
    this.socket = io('http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling']
    });
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to collaboration server');
      this.joinDocument();
    });
    
    // Document events
    this.socket.on('document_state', this.handleDocumentState.bind(this));
    this.socket.on('text_edit', this.handleTextEdit.bind(this));
    this.socket.on('cursor_update', this.handleCursorUpdate.bind(this));
    
    // User events
    this.socket.on('user_joined', this.handleUserJoined.bind(this));
    this.socket.on('user_left', this.handleUserLeft.bind(this));
    
    // Error handling
    this.socket.on('error', this.handleError.bind(this));
  }
  
  joinDocument() {
    this.socket.emit('join_document', {
      documentId: this.documentId,
      permissions: 'editor'
    });
  }
  
  sendTextEdit(operation) {
    this.socket.emit('text_edit', {
      documentId: this.documentId,
      operation
    });
  }
  
  updateCursor(position, selection) {
    this.socket.emit('cursor_update', {
      documentId: this.documentId,
      cursor: { position },
      selection
    });
  }
}
```

## Scaling and Performance

### Horizontal Scaling
The server uses Redis adapter for Socket.io, enabling horizontal scaling across multiple server instances:

1. **Load Balancer**: Distribute connections across server instances
2. **Redis Pub/Sub**: Share messages between server instances
3. **Session Affinity**: Optional sticky sessions for better performance

### Performance Optimization

- **Operation Batching**: Debounce frequent operations (50-100ms)
- **Connection Limits**: Max 100-500 connections per server instance
- **Rate Limiting**: 100 operations/second per user
- **Memory Management**: Clean up empty documents automatically

## Security

- **JWT Authentication**: All connections require valid JWT tokens
- **CORS Protection**: Configurable origin restrictions
- **Rate Limiting**: Protection against abuse and DDoS
- **Input Validation**: All messages are validated and sanitized
- **Permission Checks**: Role-based access control for documents

## Monitoring

The server includes built-in monitoring:

- **Winston Logging**: Structured logging with correlation IDs
- **Health Checks**: `/health` endpoint for load balancer checks
- **Connection Metrics**: Track active connections and operations
- **Error Tracking**: Comprehensive error logging and reporting

## Development

### Running in Development
```bash
npm run dev  # if you add nodemon
# or
npm start
```

### Testing
```bash
npm test  # Add your test scripts
```

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

1. **Connection Failed**: Check JWT token validity and server URL
2. **Permission Denied**: Verify user permissions in your database
3. **High Latency**: Check Redis connection and network performance
4. **Memory Issues**: Monitor connection count and clean up unused documents

### Logs
Check server logs for detailed error information:
```bash
tail -f logs/app.log
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - see LICENSE file for details
