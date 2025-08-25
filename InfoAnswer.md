# WebSocket Server Development Guide

## Overview

This document contains instructions for the **WebSocket server developer** who is building the standalone collaboration server. The WebSocket server will connect to the existing PostgreSQL database and handle real-time collaboration features.

## Prerequisites

The WebSocket server developer needs:
1. **Database Access** - Connection string to the existing PostgreSQL database
2. **Database Schema** - The existing tables are already set up in the main app
3. **Deployment Platform** - Railway, Render, DigitalOcean, etc.

## Database Schema (Already Exists)

The following tables are already set up in the PostgreSQL database:

```sql
-- Document sessions table (already exists)
CREATE TABLE IF NOT EXISTS document_sessions (
  id VARCHAR(255) PRIMARY KEY,
  document_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_name VARCHAR(255),
  last_active_at TIMESTAMP NOT NULL,
  cursor_position JSONB,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- Document changes table (already exists)
CREATE TABLE IF NOT EXISTS document_changes (
  id VARCHAR(255) PRIMARY KEY,
  document_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  version BIGINT NOT NULL,
  operation JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL
);

-- Documents table (already exists)
CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  content_html TEXT,
  has_been_entered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- Document shares table (already exists)
CREATE TABLE IF NOT EXISTS document_shares (
  id VARCHAR(255) PRIMARY KEY,
  document_id VARCHAR(255) NOT NULL,
  owner_user_id VARCHAR(255) NOT NULL,
  shared_user_email VARCHAR(255),
  permission VARCHAR(50) NOT NULL,
  share_token VARCHAR(255),
  allow_guest_access BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```


### Step 3: TypeScript Configuration
Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 4: Database Connection
Create `src/services/database.ts`:

```typescript
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.getClient();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const db = new DatabaseService();
```

### Step 5: Permission Service
Create `src/services/permissions.ts`:

```typescript
import { db } from './database';

export interface UserPermission {
  hasAccess: boolean;
  permission: 'owner' | 'editor' | 'viewer';
  isOwner: boolean;
}

export class PermissionService {
  static async checkDocumentPermission(
    documentId: string,
    userEmail: string,
    requiredPermission: 'owner' | 'editor' | 'viewer' = 'viewer'
  ): Promise<UserPermission> {
    try {
      // Check if user is the document owner
      const ownerResult = await db.query(
        'SELECT user_id FROM documents WHERE id = $1 AND user_id = $2',
        [documentId, userEmail]
      );

      if (ownerResult.rows.length > 0) {
        return {
          hasAccess: true,
          permission: 'owner',
          isOwner: true,
        };
      }

      // Check for shared access
      const shareResult = await db.query(
        `SELECT permission FROM document_shares 
         WHERE document_id = $1 AND shared_user_email = $2`,
        [documentId, userEmail]
      );

      if (shareResult.rows.length > 0) {
        const userPermission = shareResult.rows[0].permission;
        
        const permissionHierarchy = { owner: 3, editor: 2, viewer: 1 };
        const requiredLevel = permissionHierarchy[requiredPermission];
        const userLevel = permissionHierarchy[userPermission];

        return {
          hasAccess: userLevel >= requiredLevel,
          permission: userPermission,
          isOwner: false,
        };
      }

      return { hasAccess: false, permission: 'viewer', isOwner: false };
    } catch (error) {
      console.error('Error checking document permission:', error);
      return { hasAccess: false, permission: 'viewer', isOwner: false };
    }
  }

  static async validateUser(userEmail: string): Promise<boolean> {
    try {
      // Check if user exists by looking for any documents they own
      const result = await db.query(
        'SELECT 1 FROM documents WHERE user_id = $1 LIMIT 1',
        [userEmail]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error validating user:', error);
      return false;
    }
  }
}
```

### Step 6: Session Service
Create `src/services/sessions.ts`:

```typescript
import { db } from './database';

export interface DocumentSession {
  id: string;
  documentId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  lastActiveAt: Date;
  cursorPosition?: any;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionService {
  static async createSession(
    documentId: string,
    userId: string,
    userEmail: string,
    userName?: string,
  ): Promise<DocumentSession> {
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    await db.query(
      `INSERT INTO document_sessions 
       (id, document_id, user_id, user_email, user_name, last_active_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $6)`,
      [id, documentId, userId, userEmail, userName, now]
    );

    return {
      id,
      documentId,
      userId,
      userEmail,
      userName,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  static async updateSessionActivity(sessionId: string, cursorPosition?: any): Promise<void> {
    const now = new Date();

    if (cursorPosition) {
      await db.query(
        `UPDATE document_sessions
         SET last_active_at = $1, cursor_position = $2, updated_at = $1
         WHERE id = $3`,
        [now, JSON.stringify(cursorPosition), sessionId]
      );
    } else {
      await db.query(
        `UPDATE document_sessions
         SET last_active_at = $1, updated_at = $1
         WHERE id = $2`,
        [now, sessionId]
      );
    }
  }

  static async removeSession(sessionId: string): Promise<void> {
    await db.query('DELETE FROM document_sessions WHERE id = $1', [sessionId]);
  }
}
```

### Step 7: Document Service
Create `src/services/documents.ts`:

```typescript
import { db } from './database';

export interface DocumentChange {
  id: string;
  documentId: string;
  sessionId: string;
  userId: string;
  version: number;
  operation: any;
  createdAt: Date;
}

export class DocumentService {
  static async addDocumentChange(
    documentId: string,
    sessionId: string,
    userId: string,
    version: number,
    operation: any,
  ): Promise<DocumentChange> {
    const id = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    await db.query(
      `INSERT INTO document_changes 
       (id, document_id, session_id, user_id, version, operation, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, documentId, sessionId, userId, version, JSON.stringify(operation), now]
    );

    return {
      id,
      documentId,
      sessionId,
      userId,
      version,
      operation,
      createdAt: now,
    };
  }
}
```

### Step 8: Main WebSocket Server
Create `src/server.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PermissionService } from './services/permissions';
import { SessionService } from './services/sessions';
import { DocumentService } from './services/documents';

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket server
const wss = new WebSocketServer({ server });

interface WebSocketMessage {
  type: 'join-document' | 'leave-document' | 'document-change' | 'cursor-update' | 'user-presence';
  documentId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  data?: any;
}

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  userEmail: string;
  userName?: string;
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
    wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection established');
      
      ws.on('message', async (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          await this.handleMessage(ws, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.handleClientDisconnect(ws);
      });
    });
  }

  private async handleMessage(ws: WebSocket, message: WebSocketMessage) {
    try {
      // Authenticate user if not already authenticated
      if (!this.isClientAuthenticated(ws)) {
        const authenticated = await this.authenticateClient(ws, message);
        if (!authenticated) {
          this.sendError(ws, 'Authentication failed');
          return;
        }
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
          this.sendError(ws, 'Unknown message type');
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(ws, 'Internal server error');
    }
  }

  private async authenticateClient(ws: WebSocket, message: WebSocketMessage): Promise<boolean> {
    try {
      const userValid = await PermissionService.validateUser(message.userEmail);
      if (!userValid) {
        return false;
      }

      const clientId = this.getClientId(ws);
      const client: ConnectedClient = {
        ws,
        userId: message.userId,
        userEmail: message.userEmail,
        userName: message.userName,
        documentId: message.documentId,
        authenticated: true,
      };

      this.clients.set(clientId, client);
      return true;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  private async handleJoinDocument(ws: WebSocket, message: WebSocketMessage) {
    try {
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

      this.broadcastToDocument(message.documentId, {
        type: 'user-joined',
        userId: message.userId,
        userEmail: message.userEmail,
        userName: message.userName,
        sessionId: session.id,
        timestamp: new Date().toISOString(),
      });

      this.sendToClient(ws, {
        type: 'session-created',
        data: { sessionId: session.id },
        timestamp: new Date().toISOString(),
      });

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

    this.removeFromDocumentRoom(message.documentId, clientId);

    this.broadcastToDocument(message.documentId, {
      type: 'user-left',
      userId: message.userId,
      userEmail: message.userEmail,
      userName: message.userName,
      timestamp: new Date().toISOString(),
    });
  }

  private async handleDocumentChange(ws: WebSocket, message: WebSocketMessage) {
    try {
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

    this.broadcastToDocument(message.documentId, {
      type: 'cursor-update',
      userId: message.userId,
      userEmail: message.userEmail,
      data: message.data,
      timestamp: new Date().toISOString(),
    });
  }

  private async handleUserPresence(ws: WebSocket, message: WebSocketMessage) {
    this.broadcastToDocument(message.documentId, {
      type: 'user-presence',
      userId: message.userId,
      userEmail: message.userEmail,
      userName: message.userName,
      data: message.data,
      timestamp: new Date().toISOString(),
    });
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

  private broadcastToDocument(documentId: string, message: any) {
    const room = this.documentRooms.get(documentId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    room.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
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
const PORT = process.env.PORT || 3001;
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
```

### Step 9: Environment Configuration
Create `.env`:
```env
DATABASE_URL=postgresql://username:password@host:port/database
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://your-vercel-app.vercel.app
```

### Step 10: Package.json
```json
{
  "scripts": {
    "dev": "nodemon src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

## What the WebSocket Server Does

1. **Connects to existing PostgreSQL database** using the same connection string
2. **Validates user permissions** using existing document_shares table
3. **Manages real-time sessions** in document_sessions table
4. **Tracks document changes** in document_changes table
5. **Broadcasts updates** to all connected clients for the same document

## Integration with Vercel App

Once deployed, the Vercel app will connect to this WebSocket server using:
```env
NEXT_PUBLIC_WEBSOCKET_URL=wss://your-websocket-server.railway.app
```


The WebSocket server handles all the real-time collaboration logic while the Vercel app handles the UI and document management.
