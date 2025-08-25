import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PermissionService } from './services/permissions';
import { SessionService } from './services/sessions';
import { DocumentService } from './services/documents';
import { db } from './services/database';

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

// WebSocket server with origin validation
const wss = new WebSocketServer({
  server,
  verifyClient: (info, callback) => {
    const origin = info.origin || info.req.headers.origin;
    const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

    console.log(`WebSocket connection attempt from origin: ${origin}`);

    // Allow connections from the specified origin or localhost variations
    const allowedOrigins = [
      allowedOrigin,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001'
    ];

    if ((origin && allowedOrigins.includes(origin)) || !origin) {
      console.log('✅ WebSocket connection allowed');
      callback(true);
    } else {
      console.log(`❌ WebSocket connection rejected from origin: ${origin}`);
      callback(false, 403, 'Forbidden - Invalid origin');
    }
  }
});

interface WebSocketMessage {
  type: 'authenticate' | 'join-document' | 'leave-document' | 'document-change' | 'cursor-update' | 'user-presence';
  documentId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userImage?: string;
  shareToken?: string;
  data?: any;
}

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  userEmail: string;
  userName?: string;
  userImage?: string;
  documentId: string;
  sessionId?: string;
  authenticated: boolean;
}

class CollaborationWebSocketServer {
  private clients: Map<string, ConnectedClient> = new Map();
  private documentRooms: Map<string, Set<string>> = new Map();

  constructor() {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    wss.on('connection', (ws: WebSocket, req) => {
      const clientIP = req.socket.remoteAddress || 'unknown';
      const origin = req.headers.origin || 'unknown';

      console.log(`✅ WebSocket connection established from ${clientIP} (origin: ${origin})`);
      console.log(`   Total active connections: ${wss.clients.size}`);

      ws.on('message', async (data: Buffer) => {
        try {
          const messageData = data.toString();
          console.log(`📨 Received message: ${messageData.substring(0, 100)}${messageData.length > 100 ? '...' : ''}`);

          const message: WebSocketMessage = JSON.parse(messageData);
          await this.handleMessage(ws, message);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
          console.error('Raw message data:', data.toString());
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`🔌 WebSocket connection closed from ${clientIP} (code: ${code}, reason: ${reason.toString()})`);
        this.handleClientDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error(`❌ WebSocket error from ${clientIP}:`, error);
      });

      // Send a welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'WebSocket connection established successfully',
        timestamp: new Date().toISOString()
      }));
    });

    wss.on('error', (error) => {
      console.error('❌ WebSocket server error:', error);
    });
  }

  private async handleMessage(ws: WebSocket, message: WebSocketMessage) {
    try {
      console.log(`🔄 Processing message type: ${message.type}`);

      // Handle authentication message first
      if (message.type === 'authenticate') {
        await this.handleAuthentication(ws, message);
        return;
      }

      // Check if client is authenticated for other message types
      if (!this.isClientAuthenticated(ws)) {
        console.log(`⚠️  Unauthenticated client attempting ${message.type}, rejecting`);
        this.sendError(ws, 'Authentication required. Please send authenticate message first.');
        return;
      }

      switch (message.type) {
        case 'join-document':
          await this.handleJoinDocument(ws, message);
          break;
        case 'leave-document':
          await this.handleLeaveDocument(ws, message);
          break;
        case 'document-change':
          await this.handleDocumentChange(ws, message);
          break;
        case 'cursor-update':
          await this.handleCursorUpdate(ws, message);
          break;
        case 'user-presence':
          await this.handleUserPresence(ws, message);
          break;
        default:
          console.log(`❓ Unknown message type: ${message.type}`);
          this.sendError(ws, 'Unknown message type');
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      this.sendError(ws, 'Internal server error');
    }
  }

  private async authenticateClient(ws: WebSocket, message: WebSocketMessage): Promise<boolean> {
    try {
      if (!message.userEmail || !message.userId) {
        console.log('❌ Missing required fields for authentication');
        return false;
      }

      const isGuestUser = message.userEmail.includes('guest_') && message.userEmail.includes('@example.com');

      if (isGuestUser) {
        // For guest users, validate share token instead of user email
        if (!message.shareToken || !message.documentId) {
          console.log('❌ Missing share token or document ID for guest authentication');
          return false;
        }

        const guestAccess = await PermissionService.validateGuestAccess(message.documentId, message.shareToken);
        if (!guestAccess.hasAccess) {
          console.log('❌ Guest access denied for token:', message.shareToken);
          return false;
        }

        console.log('✅ Guest user authenticated with token:', message.shareToken);
      } else {
        // For regular users, validate user email
        const userValid = await PermissionService.validateUser(message.userEmail);
        if (!userValid) {
          console.log('❌ User validation failed for:', message.userEmail);
          return false;
        }
      }

      const clientId = this.getClientId(ws);
      const client: ConnectedClient = {
        ws,
        userId: message.userId,
        userEmail: message.userEmail,
        userName: message.userName || '',
        userImage: message.userImage,
        documentId: message.documentId || '',
        authenticated: true,
      };

      this.clients.set(clientId, client);
      return true;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  private async handleAuthentication(ws: WebSocket, message: WebSocketMessage) {
    try {
      console.log(`🔐 Authentication attempt for user: ${message.userEmail}`);

      if (!message.userEmail || !message.userId) {
        console.log('❌ Missing user credentials in authentication message');
        this.sendError(ws, 'Missing user credentials');
        return;
      }

      const authenticated = await this.authenticateClient(ws, message);

      if (authenticated) {
        console.log(`✅ User ${message.userEmail} authenticated successfully`);

        // Send authenticated response with user details
        ws.send(JSON.stringify({
          type: 'authenticated',
          userId: message.userId,
          userEmail: message.userEmail,
          userName: message.userName,
          userImage: message.userImage,
          shareToken: message.shareToken,
          timestamp: new Date().toISOString()
        }));

        console.log(`📨 Sent authenticated response to ${message.userEmail}`);
      } else {
        console.log(`❌ Authentication failed for user: ${message.userEmail}`);
        this.sendError(ws, 'Authentication failed');
      }
    } catch (error) {
      console.error('❌ Error during authentication:', error);
      this.sendError(ws, 'Authentication error');
    }
  }

  private async handleJoinDocument(ws: WebSocket, message: WebSocketMessage) {
    try {
      if (!message.documentId || !message.userEmail || !message.userId) {
        this.sendError(ws, 'Missing required fields');
        return;
      }

      const permission = await PermissionService.checkDocumentPermission(
        message.documentId,
        message.userEmail,
        'viewer'
      );

      if (!permission.hasAccess) {
        this.sendError(ws, 'Access denied to document');
        return;
      }

      const clientId = this.getClientId(ws);
      const client = this.clients.get(clientId);

      if (!client) {
        this.sendError(ws, 'Client not found');
        return;
      }

      client.documentId = message.documentId;
      this.addToDocumentRoom(message.documentId, clientId);

      const session = await SessionService.createSession(
        message.documentId,
        message.userId,
        message.userEmail,
        message.userName
      );

      client.sessionId = session.id;

      // Send user-joined message to the connecting client
      this.sendToClient(ws, {
        type: 'user-joined',
        userId: message.userId,
        userEmail: message.userEmail,
        userName: message.userName,
        userImage: message.userImage,
        shareToken: message.shareToken,
        sessionId: session.id,
        timestamp: new Date().toISOString(),
      });

      // Broadcast user-joined to other clients in the document (excluding sender)
      this.broadcastToDocument(message.documentId, {
        type: 'user-joined',
        userId: message.userId,
        userEmail: message.userEmail,
        userName: message.userName,
        userImage: message.userImage,
        shareToken: message.shareToken,
        sessionId: session.id,
        timestamp: new Date().toISOString(),
      }, ws); // Exclude the sender

      // Send session-created message
      this.sendToClient(ws, {
        type: 'session-created',
        data: { sessionId: session.id },
        timestamp: new Date().toISOString(),
      });

      console.log(`📨 Sent join responses to ${message.userEmail} for document ${message.documentId}`);

    } catch (error) {
      console.error('Error joining document:', error);
      this.sendError(ws, 'Failed to join document');
    }
  }

  private async handleLeaveDocument(ws: WebSocket, message: WebSocketMessage) {
    const clientId = this.getClientId(ws);
    const client = this.clients.get(clientId);

    if (client && client.sessionId) {
      await SessionService.removeSession(client.sessionId);
    }

    if (message.documentId) {
      this.removeFromDocumentRoom(message.documentId, clientId);

      this.broadcastToDocument(message.documentId, {
        type: 'user-left',
        userId: message.userId,
        userEmail: message.userEmail,
        userName: message.userName,
        userImage: message.userImage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleDocumentChange(ws: WebSocket, message: WebSocketMessage) {
    try {
      if (!message.documentId || !message.userEmail || !message.userId) {
        this.sendError(ws, 'Missing required fields');
        return;
      }

      const permission = await PermissionService.checkDocumentPermission(
        message.documentId,
        message.userEmail,
        'editor'
      );

      if (!permission.hasAccess) {
        this.sendError(ws, 'No edit permission for document');
        return;
      }

      const clientId = this.getClientId(ws);
      const client = this.clients.get(clientId);

      if (client && client.sessionId && message.data) {
        await DocumentService.addDocumentChange(
          message.documentId,
          client.sessionId,
          message.userId,
          message.data.version,
          message.data.operation
        );
      }

      this.broadcastToDocument(message.documentId, {
        type: 'document-change',
        userId: message.userId,
        userEmail: message.userEmail,
        data: message.data,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('Error handling document change:', error);
      this.sendError(ws, 'Failed to process document change');
    }
  }

  private async handleCursorUpdate(ws: WebSocket, message: WebSocketMessage) {
    const clientId = this.getClientId(ws);
    const client = this.clients.get(clientId);

    if (client && client.sessionId) {
      await SessionService.updateSessionActivity(client.sessionId, message.data?.cursor);
    }

    if (message.documentId) {
      this.broadcastToDocument(message.documentId, {
        type: 'cursor-update',
        userId: message.userId,
        userEmail: message.userEmail,
        userName: message.userName,
        userImage: message.userImage,
        data: message.data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleUserPresence(ws: WebSocket, message: WebSocketMessage) {
    if (message.documentId) {
      this.broadcastToDocument(message.documentId, {
        type: 'user-presence',
        userId: message.userId,
        userEmail: message.userEmail,
        userName: message.userName,
        userImage: message.userImage,
        data: message.data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleClientDisconnect(ws: WebSocket) {
    const clientId = this.getClientId(ws);
    const client = this.clients.get(clientId);

    if (client) {
      if (client.sessionId) {
        SessionService.removeSession(client.sessionId).catch(console.error);
      }

      this.removeFromDocumentRoom(client.documentId, clientId);
      this.clients.delete(clientId);

      this.broadcastToDocument(client.documentId, {
        type: 'user-left',
        userId: client.userId,
        userEmail: client.userEmail,
        userName: client.userName,
        userImage: client.userImage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private addToDocumentRoom(documentId: string, clientId: string) {
    if (!this.documentRooms.has(documentId)) {
      this.documentRooms.set(documentId, new Set());
    }
    this.documentRooms.get(documentId)!.add(clientId);
  }

  private removeFromDocumentRoom(documentId: string, clientId: string) {
    const room = this.documentRooms.get(documentId);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.documentRooms.delete(documentId);
      }
    }
  }

  private broadcastToDocument(documentId: string, message: any, excludeWs?: WebSocket) {
    const room = this.documentRooms.get(documentId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    room.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN && client.ws !== excludeWs) {
        client.ws.send(messageStr);
      }
    });
  }

  private sendToClient(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string) {
    this.sendToClient(ws, {
      type: 'error',
      error,
      timestamp: new Date().toISOString(),
    });
  }

  private getClientId(ws: WebSocket): string {
    return (ws as any)._socket?.remoteAddress + ':' + (ws as any)._socket?.remotePort;
  }

  private isClientAuthenticated(ws: WebSocket): boolean {
    const clientId = this.getClientId(ws);
    const client = this.clients.get(clientId);
    return client?.authenticated || false;
  }
}

// Initialize WebSocket server
new CollaborationWebSocketServer();

// Start server
const PORT = process.env.PORT || 3100;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
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
