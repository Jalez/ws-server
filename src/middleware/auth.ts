import { Socket } from 'socket.io';
import { PermissionService } from '../services/permissions';
import { AuthHandshake } from '../types/socket';

export const authenticateSocket = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const token = socket.handshake.auth?.token;
    const userEmail = socket.handshake.auth?.userEmail;
    const userId = socket.handshake.auth?.userId;

    console.log(`🔐 Socket.io authentication attempt:`, {
      userEmail,
      userId,
      hasToken: !!token,
      socketId: socket.id
    });

    if (!userEmail || !userId) {
      console.log('❌ Missing user credentials in socket authentication');
      return next(new Error('Missing user credentials'));
    }

    // For guest users, validate share token if provided
    if (userEmail.includes('guest_') && userEmail.includes('@example.com')) {
      if (!token) {
        console.log('❌ Missing share token for guest authentication');
        return next(new Error('Share token required for guest access'));
      }

      const documentId = socket.handshake.auth?.documentId;
      if (!documentId) {
        console.log('❌ Missing document ID for guest authentication');
        return next(new Error('Document ID required for guest access'));
      }

      const guestAccess = await PermissionService.validateGuestAccess(documentId, token);
      if (!guestAccess.hasAccess) {
        console.log('❌ Guest access denied for token:', token);
        return next(new Error('Invalid share token'));
      }

      console.log('✅ Guest user authenticated with token:', token);
    } else {
      // For regular users, validate user email
      const userValid = await PermissionService.validateUser(userEmail);
      if (!userValid) {
        console.log('❌ User validation failed for:', userEmail);
        return next(new Error('Invalid user'));
      }
      console.log('✅ Authenticated user validated:', userEmail);
    }

    // Store user info on socket
    (socket.data as any).userId = userId;
    (socket.data as any).userEmail = userEmail;
    (socket.data as any).userName = socket.handshake.auth?.userName || '';
    (socket.data as any).userImage = socket.handshake.auth?.userImage;
    (socket.data as any).shareToken = token;

    console.log(`✅ Socket authenticated for ${userEmail} (${socket.id})`);
    next();
  } catch (error) {
    console.error('❌ Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
};
