import { Socket } from 'socket.io';
import { PermissionService } from '../services/permissions';
import { SocketMessage } from '../types/socket';

export class CharacterHandlers {
  // Handle character-change message
  async handleCharacterChange(socket: Socket, data: SocketMessage) {
    try {
      console.log("🔤 Server: Received character change", {
        documentId: data.documentId,
        userId: socket.data.userId,
        userEmail: socket.data.userEmail,
        data: data.data
      });

      if (!data.documentId || !socket.data.userEmail || !socket.data.userId) {
        socket.emit('error', { error: 'Missing required fields' });
        return;
      }

      // Check if user has edit permission
      const permission = await PermissionService.checkDocumentPermission(
        data.documentId,
        socket.data.userEmail,
        'editor'
      );

      console.log("🔐 Server: Character change permission check result", {
        documentId: data.documentId,
        userEmail: socket.data.userEmail,
        hasAccess: permission.hasAccess,
        permission: permission.permission
      });

      if (!permission.hasAccess) {
        console.log("❌ Server: No edit permission for character change");
        socket.emit('error', { error: 'No edit permission for document' });
        return;
      }

      // Validate character change data
      if (!data.data || typeof data.data.position !== 'number' ||
          typeof data.data.character !== 'string' ||
          !['insert', 'delete'].includes(data.data.operation)) {
        console.log("❌ Server: Invalid character change data");
        socket.emit('error', { error: 'Invalid character change data' });
        return;
      }

      // Broadcast character change to all clients in the document room
      console.log("📡 Server: Broadcasting character change to other clients");
      socket.to(data.documentId).emit('character-change', {
        userId: socket.data.userId,
        userEmail: socket.data.userEmail,
        data: data.data,
        timestamp: new Date().toISOString(),
      }); // Exclude the sender from receiving their own character changes
      console.log("✅ Server: Character change broadcasted successfully");

    } catch (error) {
      console.error('❌ Server: Error handling character change:', error);
      socket.emit('error', { error: 'Failed to process character change' });
    }
  }
}

