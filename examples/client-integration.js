// Example client integration for the WebSocket collaboration server
// This shows how to connect from a frontend application

const WebSocket = require('ws');

// Configuration
const WS_URL = process.env.WEBSOCKET_URL || 'ws://localhost:3100';
const DOCUMENT_ID = 'your-document-id';
const USER_ID = 'user@example.com';
const USER_EMAIL = 'user@example.com';
const USER_NAME = 'User Name';

class CollaborationClient {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.documentId = DOCUMENT_ID;
  }

  connect() {
    console.log('Connecting to WebSocket server...');
    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      console.log('Connected to WebSocket server');
      this.isConnected = true;

      // Join a document
      this.joinDocument();
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('Disconnected from WebSocket server');
      this.isConnected = false;
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  joinDocument() {
    const message = {
      type: 'join-document',
      documentId: this.documentId,
      userId: USER_ID,
      userEmail: USER_EMAIL,
      userName: USER_NAME,
      data: {
        timestamp: new Date().toISOString()
      }
    };

    this.sendMessage(message);
  }

  sendDocumentChange(operation, version) {
    const message = {
      type: 'document-change',
      documentId: this.documentId,
      userId: USER_ID,
      userEmail: USER_EMAIL,
      userName: USER_NAME,
      data: {
        operation: operation,
        version: version,
        timestamp: new Date().toISOString()
      }
    };

    this.sendMessage(message);
  }

  sendCursorUpdate(cursorPosition, selection) {
    const message = {
      type: 'cursor-update',
      documentId: this.documentId,
      userId: USER_ID,
      userEmail: USER_EMAIL,
      userName: USER_NAME,
      data: {
        cursor: cursorPosition,
        selection: selection,
        timestamp: new Date().toISOString()
      }
    };

    this.sendMessage(message);
  }

  sendPresenceUpdate(presenceData) {
    const message = {
      type: 'user-presence',
      documentId: this.documentId,
      userId: USER_ID,
      userEmail: USER_EMAIL,
      userName: USER_NAME,
      data: presenceData
    };

    this.sendMessage(message);
  }

  leaveDocument() {
    const message = {
      type: 'leave-document',
      documentId: this.documentId,
      userId: USER_ID,
      userEmail: USER_EMAIL,
      userName: USER_NAME
    };

    this.sendMessage(message);
  }

  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  handleMessage(message) {
    console.log('Received message:', message.type, message);

    switch (message.type) {
      case 'session-created':
        console.log('Session created:', message.data.sessionId);
        break;

      case 'user-joined':
        console.log('User joined:', message.userName);
        // Update UI to show new collaborator
        break;

      case 'user-left':
        console.log('User left:', message.userName);
        // Update UI to remove collaborator
        break;

      case 'document-change':
        console.log('Document changed by:', message.userName);
        // Apply the document change to the local editor
        this.handleDocumentChange(message.data);
        break;

      case 'cursor-update':
        console.log('Cursor updated by:', message.userName);
        // Update cursor position in UI
        this.handleCursorUpdate(message.data);
        break;

      case 'user-presence':
        console.log('Presence updated by:', message.userName);
        // Update user presence indicators
        break;

      case 'error':
        console.error('Server error:', message.error);
        // Handle error in UI
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  handleDocumentChange(data) {
    // Implement your document change handling logic
    // This would typically update your editor with the received operation
    console.log('Applying document change:', data);
  }

  handleCursorUpdate(data) {
    // Implement cursor position updates
    console.log('Updating cursor position:', data);
  }

  disconnect() {
    if (this.ws) {
      this.leaveDocument();
      this.ws.close();
    }
  }
}

// Usage example
if (require.main === module) {
  const client = new CollaborationClient();

  // Connect to the server
  client.connect();

  // Example: Send a document change after 2 seconds
  setTimeout(() => {
    client.sendDocumentChange({
      type: 'insert',
      position: 10,
      content: 'Hello World'
    }, 1);
  }, 2000);

  // Example: Send cursor update after 3 seconds
  setTimeout(() => {
    client.sendCursorUpdate({ line: 5, column: 10 }, null);
  }, 3000);

  // Disconnect after 10 seconds
  setTimeout(() => {
    client.disconnect();
    process.exit(0);
  }, 10000);
}

module.exports = CollaborationClient;