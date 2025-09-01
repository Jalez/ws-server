import { Socket } from 'socket.io';
import { Server } from 'socket.io';
import { PermissionService } from '../services/permissions';
import { SessionService } from '../services/sessions';
import { SocketMessage } from '../types/socket';

type JSONStep = any; // or: ReturnType<Step["toJSON"]>
export interface IncomingChange {
  documentId: string;
  userId: string;
  clientId: string;
  version: number;
  steps: JSONStep[];
}

export type CursorPayload = {
  documentId: string;
  clientId: string;
  userId: string;
  userName?: string;
  color?: string;
  anchor: number;   // selection anchor in sender's doc after their local tx
  head: number;     // selection head in sender's doc after their local tx
  ts: number;
};

interface OutgoingChange extends IncomingChange {
  isAck?: boolean;       // true for echo back to sender (clear pending)
  serverTs: string;      // optional server timestamp
}


export class DocumentHandlers {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  

  // Handle join-document message
  async handleJoinDocument(socket: Socket, data: SocketMessage) {
    try {
      if (!data.documentId || !data.userEmail || !data.userId) {
        socket.emit('error', { error: 'Missing required fields' });
        return;
      }

      const permission = await PermissionService.checkDocumentPermission(
        data.documentId,
        data.userEmail,
        'viewer'
      );

      if (!permission.hasAccess) {
        socket.emit('error', { error: 'Access denied to document' });
        return;
      }

      // Join the document room
      socket.join(data.documentId);

      const session = await SessionService.createSession(
        data.documentId,
        data.userId,
        data.userEmail,
        data.userName
      );

      // Store session info on socket
      (socket.data as any).documentId = data.documentId;
      (socket.data as any).sessionId = session.id;

      // Send current active users list to the newly joined client
      const roomSockets = await this.io.in(data.documentId).fetchSockets();
      const currentUsers = roomSockets
        .filter(s => s.id !== socket.id)
        .map(s => ({
          clientId: s.id,
          userEmail: s.data.userEmail,
          userName: s.data.userName,
          userImage: s.data.userImage,
        }));

      if (currentUsers.length > 0) {
        console.log(`📨 Sending current users list to ${data.userEmail}: ${currentUsers.length} existing users`);
        socket.emit('current-users', {
          users: currentUsers,
          timestamp: new Date().toISOString(),
        });
      }

      // Send user-joined message to the connecting client
      console.log(`📨 Sending user-joined to client: ${data.userEmail}`);
      socket.emit('user-joined', {
        userId: data.userId,
        userEmail: data.userEmail,
        userName: data.userName,
        userImage: data.userImage,

        sessionId: session.id,
        timestamp: new Date().toISOString(),
      });

      // Broadcast user-joined to other clients in the document (excluding sender)
      console.log(`📡 Broadcasting user-joined to document ${data.documentId}: ${data.userEmail}`);
      socket.to(data.documentId).emit('user-joined', {
        userId: data.userId,
        userEmail: data.userEmail,
        userName: data.userName,
        userImage: data.userImage,

        sessionId: session.id,
        timestamp: new Date().toISOString(),
      });

      // Send session-created message
      socket.emit('session-created', {
        data: { sessionId: session.id },
        timestamp: new Date().toISOString(),
      });

      console.log(`📨 Sent join responses to ${data.userEmail} for document ${data.documentId}`);

    } catch (error) {
      console.error('Error joining document:', error);
      socket.emit('error', { error: 'Failed to join document' });
    }
  }

  // Handle leave-document message
  async handleLeaveDocument(socket: Socket, data: SocketMessage) {
    try {
      if (socket.data.sessionId) {
        await SessionService.removeSession(socket.data.sessionId);
      }

      if (socket.data.documentId) {
        // Leave the document room
        socket.leave(socket.data.documentId);

        // Broadcast user-left to other clients in the document
        socket.to(socket.data.documentId).emit('user-left', {
          userId: socket.data.userId,
          userEmail: socket.data.userEmail,
          userName: socket.data.userName,
          userImage: socket.data.userImage,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error leaving document:', error);
    }
  }

  // Handle document-change message
  async handleDocumentChange(socket: Socket, data: IncomingChange) {
    try {
      // Basic guards
      if (!data?.documentId || !data?.clientId || !Array.isArray(data?.steps)) {
        socket.emit("error", { error: "Invalid change payload" });
        return;
      }
      if (!socket.data?.userEmail || !socket.data?.userId) {
        socket.emit("error", { error: "Missing user identity" });
        return;
      }
  
      // Permission check (editor access)
      const perm = await PermissionService.checkDocumentPermission(
        data.documentId,
        socket.data.userEmail,
        "editor"
      );
      if (!perm?.hasAccess) {
        socket.emit("error", { error: "No edit permission for document" });
        return;
      }
  
      // Compose outbound message
      const msg: OutgoingChange = {
        documentId: data.documentId,
        userId: socket.data.userId,     // authoritative from session
        clientId: data.clientId,
        version: data.version ?? 0,
        steps: data.steps,
        serverTs: new Date().toISOString(),
      };
  
      // 1) ACK the sender so they can clear pending local steps
      socket.emit("document-change", { ...msg, isAck: true });
  
      // 2) Broadcast to everyone else in the document room
      socket.to(data.documentId).emit("document-change", msg);
  
    } catch (err) {
      console.error("❌ Server: document-change error:", err);
      socket.emit("error", { error: "Failed to process document change" });
    }
  }

  // Handle cursor-update message
  async handleCursorUpdate(socket: Socket, data: CursorPayload) {
    try {
      if (!data?.documentId || !data?.clientId) return;
      // optional: permission check like in steps handler
      // await PermissionService.checkDocumentPermission(...)
  
      // Do NOT echo to sender; only broadcast to room
      socket.to(data.documentId).emit("cursor-update", data);
    } catch (e) {
      console.error("cursor-update error:", e);
    }
  }
  
  // Handle user-presence message
  async handleUserPresence(socket: Socket, data: SocketMessage) {
    try {
      if (data.documentId) {
        socket.to(data.documentId).emit('user-presence', {
          userId: socket.data.userId,
          userEmail: socket.data.userEmail,
          userName: socket.data.userName,
          userImage: socket.data.userImage,
          data: data.data,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error handling user presence:', error);
    }
  }

  // Handle client disconnect
  async handleDisconnect(socket: Socket) {
    try {
      console.log(`🔌 Socket.io client disconnected: ${socket.id}`);

      if (socket.data.sessionId) {
        await SessionService.removeSession(socket.data.sessionId);
      }

      if (socket.data.documentId) {
        // Leave the document room
        socket.leave(socket.data.documentId);

        // Broadcast user-left to other clients in the document
        socket.to(socket.data.documentId).emit('user-left', {
          userId: socket.data.userId,
          userEmail: socket.data.userEmail,
          userName: socket.data.userName,
          userImage: socket.data.userImage,
          timestamp: new Date().toISOString(),
        });

        console.log(`📡 Broadcasted user-left for ${socket.data.userEmail} to document ${socket.data.documentId}`);
      }
    } catch (error) {
      console.error('Error handling client disconnect:', error);
    }
  }
}
