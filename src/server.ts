import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';

import { db } from './services/database';
import { authenticateSocket } from './middleware/auth';
import { CursorPayload, DocumentHandlers } from './handlers/documentHandlers';
import { CharacterHandlers } from './handlers/characterHandlers';
import { SocketMessage } from './types/socket';
import { IncomingChange } from './handlers/documentHandlers';

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io server with CORS configuration
const io = new SocketIOServer(server, {
  cors: {
    origin: [
      process.env.CORS_ORIGIN || 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001'
    ],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Initialize handlers
const documentHandlers = new DocumentHandlers(io);
const characterHandlers = new CharacterHandlers();

// Use authentication middleware
io.use(authenticateSocket);

// Connection handling
io.on('connection', (socket) => {
  const clientIP = socket.handshake.address || 'unknown';
  const origin = socket.handshake.headers.origin || 'unknown';

  console.log(`✅ Socket.io connection established from ${clientIP} (origin: ${origin})`);
  console.log(`   Socket ID: ${socket.id}`);
  console.log(`   Total active connections: ${io.engine.clientsCount}`);

  // Send welcome message
  socket.emit('connected', {
    message: 'Socket.io connection established successfully',
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });

  // Legacy authentication support
  socket.on('authenticate', async (data: SocketMessage) => {
    try {
      console.log(`🔐 Legacy authentication attempt for ${data.userEmail}`);
      socket.emit('authenticated', {
        userId: data.userId,
        userEmail: data.userEmail,
        userName: data.userName,
        userImage: data.userImage,

        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error during legacy authentication:', error);
      socket.emit('error', { error: 'Authentication error' });
    }
  });

  // Document collaboration events
  socket.on('join-document', (data: SocketMessage) =>
    documentHandlers.handleJoinDocument(socket, data));

  socket.on('leave-document', (data: SocketMessage) =>
    documentHandlers.handleLeaveDocument(socket, data));

  socket.on('document-change', (data: IncomingChange) =>
    documentHandlers.handleDocumentChange(socket, data));

  socket.on('cursor-update', (data: CursorPayload) =>
    documentHandlers.handleCursorUpdate(socket, data));

  socket.on('user-presence', (data: SocketMessage) =>
    documentHandlers.handleUserPresence(socket, data));

  // Character editing events
  socket.on('character-change', (data: SocketMessage) =>
    characterHandlers.handleCharacterChange(socket, data));

  // Handle client disconnect
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket ${socket.id} disconnected - Reason: ${reason}`);
    documentHandlers.handleDisconnect(socket);
  });
});

// Start server
const PORT = process.env.PORT || 3100;
server.listen(PORT, () => {
  console.log(`✅ WebSocket server running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await db.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
