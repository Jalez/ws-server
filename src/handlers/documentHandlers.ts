import { Socket } from 'socket.io';
import { Server } from 'socket.io';
import { PermissionService } from '../services/permissions';
import { SessionService } from '../services/sessions';
import { SocketMessage } from '../types/socket';

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
        shareToken: data.shareToken,
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
        shareToken: data.shareToken,
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
  async handleDocumentChange(socket: Socket, data: SocketMessage) {
    try {
      // Special logging for delete operations
      if (data.data?.operation?.type === "delete") {
        console.log(`🗑️ Server: Delete operation received - pos: ${data.data.operation.position}, len: ${data.data.operation.length}`);
      }

      if (!data.documentId || !socket.data.userEmail || !socket.data.userId) {
        socket.emit('error', { error: 'Missing required fields' });
        return;
      }

      const permission = await PermissionService.checkDocumentPermission(
        data.documentId,
        socket.data.userEmail,
        'editor'
      );

      console.log("🔐 Server: Document permission check result", {
        documentId: data.documentId,
        userEmail: socket.data.userEmail,
        hasAccess: permission.hasAccess,
        permission: permission.permission
      });

      if (!permission.hasAccess) {
        console.error("❌ Server: No edit permission for document change");
        socket.emit('error', { error: 'No edit permission for document' });
        return;
      }

      console.log("👤 Server: Client info for document change", {
        socketId: socket.id,
        hasSessionId: !!socket.data.sessionId,
        hasData: !!data.data
      });

      // Handle sync requests specially
      if (data.data?.operation?.type === "sync-request") {
        console.log("[bug1] 🔄 Server: Received sync request - requesting document state from database");

        // For sync requests, we need to get the current document state
        // Since the WebSocket server doesn't have direct DB access, we'll broadcast to all clients
        // and hope one of them has the correct state to respond
        console.log("[bug1] 📡 Server: Broadcasting sync request to all clients");
        socket.to(data.documentId).emit('document-change', {
          userId: socket.data.userId,
          userEmail: socket.data.userEmail,
          data: {
            operation: {
              type: "sync-request",
              content: data.data.operation.content,
              timestamp: new Date().toISOString(),
            }
          },
          timestamp: new Date().toISOString(),
        });

        console.log("[bug1] ✅ Server: Sync request broadcasted - waiting for response");
        return; // Don't continue with normal broadcast
      }

      // Document persistence is handled by the main backend API
      // WebSocket server only broadcasts real-time updates

      const broadcastMessage = {
        type: 'document-change',
        userId: socket.data.userId,
        userEmail: socket.data.userEmail,
        data: data.data,
        timestamp: new Date().toISOString(),
      };

      socket.to(data.documentId).emit('document-change', broadcastMessage); // Exclude the sender

    } catch (error) {
      console.error('❌ Server: Error handling document change:', error);
      socket.emit('error', { error: 'Failed to process document change' });
    }
  }

  // Handle cursor-update message
  async handleCursorUpdate(socket: Socket, data: SocketMessage) {
    try {
      if (socket.data.sessionId) {
        await SessionService.updateSessionActivity(socket.data.sessionId, data.data?.cursor);
      }

      if (data.documentId) {
        socket.to(data.documentId).emit('cursor-update', {
          userId: socket.data.userId,
          userEmail: socket.data.userEmail,
          userName: socket.data.userName,
          userImage: socket.data.userImage,
          data: { cursor: data.data?.cursor || data.data },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error handling cursor update:', error);
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
