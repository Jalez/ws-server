import { Socket } from 'socket.io';

export interface SocketMessage {
  type: 'authenticate' | 'join-document' | 'leave-document' | 'document-change' | 'character-change' | 'cursor-update' | 'user-presence';
  documentId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userImage?: string;
  shareToken?: string;
  data?: any;
}

export interface CharacterChange {
  position: number;
  character: string;
  operation: 'insert' | 'delete';
}

export interface ConnectedClient {
  socket: Socket;
  userId: string;
  userEmail: string;
  userName?: string;
  userImage?: string;
  documentId: string;
  sessionId?: string;
  authenticated: boolean;
}

export interface AuthHandshake {
  token?: string;
  userEmail?: string;
  userId?: string;
  userName?: string;
  userImage?: string;
  documentId?: string;
}

// Extended socket data type for our application
export interface ExtendedSocketData {
  userId?: string;
  userEmail?: string;
  userName?: string;
  userImage?: string;
  shareToken?: string;
  documentId?: string;
  sessionId?: string;
}
