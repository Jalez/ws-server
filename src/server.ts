import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PermissionService } from './services/permissions';
import { SessionService } from './services/sessions';

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
  type: 'authenticate' | 'join-document' | 'leave-document' | 'document-change' | 'character-change' | 'cursor-update' | 'user-presence';
  documentId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userImage?: string;
  shareToken?: string;
  data?: any;
}

interface CharacterChange {
  position: number;
  character: string;
  operation: 'insert' | 'delete';
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
        case 'character-change':
          await this.handleCharacterChange(ws, message);
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
      console.log(`🔐 STARTING authenticateClient function`);
      console.log(`🔐 Authenticating client:`, {
        userEmail: message.userEmail,
        userId: message.userId,
        shareToken: message.shareToken ? 'present' : 'none',
        documentId: message.documentId
      });

      if (!message.userEmail || !message.userId) {
        console.log('❌ Missing required fields for authentication');
        return false;
      }

      console.log(`🔍 DEBUG: About to check guest detection for email: ${message.userEmail}`);
      const isGuestUser = message.userEmail.includes('guest_') && message.userEmail.includes('@example.com');
      console.log(`👤 User type detected: ${isGuestUser ? 'GUEST' : 'AUTHENTICATED'} for email: ${message.userEmail}`);
      console.log(`🔍 Guest detection details: contains 'guest_': ${message.userEmail.includes('guest_')}, contains '@example.com': ${message.userEmail.includes('@example.com')}`);
      console.log(`🔍 Full message details:`, JSON.stringify(message, null, 2));

      if (isGuestUser) {
        // For guest users, validate share token instead of user email
        console.log(`🔍 Guest authentication details: shareToken: '${message.shareToken}', documentId: '${message.documentId}'`);
        if (!message.shareToken || !message.documentId) {
          console.log('❌ Missing share token or document ID for guest authentication');
          return false;
        }

        console.log(`🔍 Validating guest access for document ${message.documentId} with token ${message.shareToken}`);
        const guestAccess = await PermissionService.validateGuestAccess(message.documentId, message.shareToken);
        if (!guestAccess.hasAccess) {
          console.log('❌ Guest access denied for token:', message.shareToken);
          return false;
        }

        console.log('✅ Guest user authenticated with token:', message.shareToken);
      } else {
        // For regular users, validate user email
        console.log(`🔍 Validating authenticated user: ${message.userEmail}`);
        const userValid = await PermissionService.validateUser(message.userEmail);
        if (!userValid) {
          console.log('❌ User validation failed for:', message.userEmail);
          return false;
        }
        console.log('✅ Authenticated user validated:', message.userEmail);
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
      console.log(`✅ Client authenticated and stored:`, {
        clientId,
        userEmail: message.userEmail,
        documentId: message.documentId
      });
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

      console.log(`🔍 About to call authenticateClient for user: ${message.userEmail}`);
      const authenticated = await this.authenticateClient(ws, message);
      console.log(`🔍 authenticateClient returned: ${authenticated} for user: ${message.userEmail}`);

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
      if (error instanceof Error) {
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error message:', error.message);
      }
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

      // Send current active users list to the newly joined client
      const currentUsers = this.getDocumentClients(message.documentId);
      if (currentUsers.length > 1) { // More than just this user
        console.log(`📨 Sending current users list to ${message.userEmail}: ${currentUsers.length - 1} existing users`);
        this.sendToClient(ws, {
          type: 'current-users',
          users: currentUsers.filter(user => user.clientId !== clientId), // Exclude themselves
          timestamp: new Date().toISOString(),
        });
      }

      // Send user-joined message to the connecting client
      console.log(`📨 Sending user-joined to client: ${message.userEmail}`);
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
      console.log(`📡 Broadcasting user-joined to document ${message.documentId}: ${message.userEmail}`);
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
      // Special logging for delete operations
      if (message.data?.operation?.type === "delete") {
        console.log(`🗑️ Server: Delete operation received - pos: ${message.data.operation.position}, len: ${message.data.operation.length}`);
      }

      if (!message.documentId || !message.userEmail || !message.userId) {
        console.error("❌ Server: Missing required fields for document change");
        this.sendError(ws, 'Missing required fields');
        return;
      }

      const permission = await PermissionService.checkDocumentPermission(
        message.documentId,
        message.userEmail,
        'editor'
      );

      console.log("🔐 Server: Document permission check result", {
        documentId: message.documentId,
        userEmail: message.userEmail,
        hasAccess: permission.hasAccess,
        permission: permission.permission
      });

      if (!permission.hasAccess) {
        console.error("❌ Server: No edit permission for document change");
        this.sendError(ws, 'No edit permission for document');
        return;
      }

      const clientId = this.getClientId(ws);
      const client = this.clients.get(clientId);

      console.log("👤 Server: Client info for document change", {
        clientId,
        hasClient: !!client,
        hasSessionId: !!client?.sessionId,
        hasData: !!message.data
      });

      // Handle sync requests specially
      if (message.data?.operation?.type === "sync-request") {
        console.log("[bug1] 🔄 Server: Received sync request - requesting document state from database");

        // For sync requests, we need to get the current document state
        // Since the WebSocket server doesn't have direct DB access, we'll broadcast to all clients
        // and hope one of them has the correct state to respond
        console.log("[bug1] 📡 Server: Broadcasting sync request to all clients");
        this.broadcastToDocument(message.documentId, {
          type: 'document-change',
          userId: message.userId,
          userEmail: message.userEmail,
          data: {
            operation: {
              type: "sync-request",
              content: message.data.operation.content,
              timestamp: new Date().toISOString(),
            }
          },
          timestamp: new Date().toISOString(),
        }, ws); // Exclude the sender

        console.log("[bug1] ✅ Server: Sync request broadcasted - waiting for response");
        return; // Don't continue with normal broadcast
      }

      // Document persistence is handled by the main backend API
      // WebSocket server only broadcasts real-time updates

      const broadcastMessage = {
        type: 'document-change',
        userId: message.userId,
        userEmail: message.userEmail,
        data: message.data,
        timestamp: new Date().toISOString(),
      };

      this.broadcastToDocument(message.documentId, broadcastMessage, ws); // Exclude the sender

    } catch (error) {
      console.error('❌ Server: Error handling document change:', error);
      this.sendError(ws, 'Failed to process document change');
    }
  }

  private async handleCharacterChange(ws: WebSocket, message: WebSocketMessage) {
    try {
      console.log("🔤 Server: Received character change", {
        documentId: message.documentId,
        userId: message.userId,
        userEmail: message.userEmail,
        data: message.data
      });

      if (!message.documentId || !message.userEmail || !message.userId) {
        console.error("❌ Server: Missing required fields for character change");
        this.sendError(ws, 'Missing required fields');
        return;
      }

      // Check if user has edit permission
      const permission = await PermissionService.checkDocumentPermission(
        message.documentId,
        message.userEmail,
        'editor'
      );

      console.log("🔐 Server: Character change permission check result", {
        documentId: message.documentId,
        userEmail: message.userEmail,
        hasAccess: permission.hasAccess,
        permission: permission.permission
      });

      if (!permission.hasAccess) {
        console.log("❌ Server: No edit permission for character change");
        this.sendError(ws, 'No edit permission for document');
        return;
      }

      // Validate character change data
      if (!message.data || typeof message.data.position !== 'number' ||
          typeof message.data.character !== 'string' ||
          !['insert', 'delete'].includes(message.data.operation)) {
        console.log("❌ Server: Invalid character change data");
        this.sendError(ws, 'Invalid character change data');
        return;
      }

      // Broadcast character change to all clients in the document room
      console.log("📡 Server: Broadcasting character change to other clients");
      this.broadcastToDocument(message.documentId, {
        type: 'character-change',
        userId: message.userId,
        userEmail: message.userEmail,
        data: message.data,
        timestamp: new Date().toISOString(),
      }, ws); // Exclude the sender from receiving their own character changes
      console.log("✅ Server: Character change broadcasted successfully");

    } catch (error) {
      console.error('❌ Server: Error handling character change:', error);
      this.sendError(ws, 'Failed to process character change');
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
        data: { cursor: message.data?.cursor || message.data }, // Ensure cursor data is nested
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

    console.log(`🔌 Handling client disconnect for clientId: ${clientId}`);

    if (client) {
      console.log(`🔌 Disconnecting user: ${client.userEmail} from document: ${client.documentId}`);

      if (client.sessionId) {
        SessionService.removeSession(client.sessionId).catch(console.error);
      }

      this.removeFromDocumentRoom(client.documentId, clientId);
      this.clients.delete(clientId);

      console.log(`📡 Broadcasting user-left for ${client.userEmail} to document ${client.documentId}`);
      this.broadcastToDocument(client.documentId, {
        type: 'user-left',
        userId: client.userId,
        userEmail: client.userEmail,
        userName: client.userName,
        userImage: client.userImage,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log(`🔌 Client ${clientId} not found in clients map during disconnect`);
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

  private getDocumentClients(documentId: string): Array<{ clientId: string; userEmail: string; userName?: string; userImage?: string }> {
    const room = this.documentRooms.get(documentId);
    if (!room) {
      return [];
    }

    const clients: Array<{ clientId: string; userEmail: string; userName?: string; userImage?: string }> = [];
    const seenEmails = new Set<string>();

    room.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && !seenEmails.has(client.userEmail)) {
        clients.push({
          clientId,
          userEmail: client.userEmail,
          userName: client.userName,
          userImage: client.userImage,
        });
        seenEmails.add(client.userEmail);
      }
    });

    return clients;
  }

  private broadcastToDocument(documentId: string, message: any, excludeWs?: WebSocket) {
    const room = this.documentRooms.get(documentId);
    if (!room) {
      console.log(`[bug1] 📡 No room found for document ${documentId}`);
      return;
    }

    const messageStr = JSON.stringify(message);

    let sentCount = 0;
    room.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN && client.ws !== excludeWs) {
        client.ws.send(messageStr);
        sentCount++;
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
