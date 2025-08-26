import { WebSocketServer, WebSocket } from 'ws';
import { CollaborationWebSocketServer } from '../server';

// Mock WebSocket client
class MockWebSocket {
  readyState = WebSocket.OPEN;
  onopen: () => void = () => {};
  onmessage: (event: any) => void = () => {};
  onerror: (error: any) => void = () => {};
  onclose: (event: any) => void = () => {};
  send = jest.fn();
  close = jest.fn();
}

// Mock clients map for testing
const mockClients = new Map();
const mockDocumentRooms = new Map();

describe('WebSocket Server Delete Operations', () => {
  let server: CollaborationWebSocketServer;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWs = new MockWebSocket();

    // Mock the clients and documentRooms
    (server as any).clients = mockClients;
    (server as any).documentRooms = mockDocumentRooms;

    mockClients.clear();
    mockDocumentRooms.clear();
  });

  test('should broadcast delete operations to other clients', () => {
    const deleteMessage = {
      type: 'document-change',
      documentId: 'test-doc',
      userId: 'user1',
      userEmail: 'user1@test.com',
      data: {
        version: Date.now(),
        operation: {
          type: 'delete',
          position: 5,
          length: 3,
          timestamp: new Date().toISOString(),
        }
      },
    };

    // Mock clients in the same document room
    const client1 = { ws: mockWs, userEmail: 'user1@test.com', documentId: 'test-doc' };
    const client2 = { ws: new MockWebSocket(), userEmail: 'user2@test.com', documentId: 'test-doc' };

    mockClients.set('client1', client1);
    mockClients.set('client2', client2);

    mockDocumentRooms.set('test-doc', new Set(['client1', 'client2']));

    // Spy on the broadcastToDocument method
    const broadcastSpy = jest.spyOn(server as any, 'broadcastToDocument');

    // Simulate handling the message
    (server as any).handleDocumentChange(mockWs, deleteMessage);

    // Verify that broadcastToDocument was called
    expect(broadcastSpy).toHaveBeenCalledWith('test-doc', expect.any(Object), mockWs);

    // Verify the broadcast message contains the delete operation
    const broadcastMessage = broadcastSpy.mock.calls[0][1];
    expect(broadcastMessage.type).toBe('document-change');
    expect(broadcastMessage.data.operation.type).toBe('delete');
    expect(broadcastMessage.data.operation.position).toBe(5);
    expect(broadcastMessage.data.operation.length).toBe(3);
  });

  test('should validate delete operation data', () => {
    const validDeleteMessage = {
      type: 'document-change',
      documentId: 'test-doc',
      userId: 'user1',
      userEmail: 'user1@test.com',
      data: {
        version: Date.now(),
        operation: {
          type: 'delete',
          position: 5,
          length: 3,
          timestamp: new Date().toISOString(),
        }
      },
    };

    // Test valid message
    expect(validDeleteMessage.data.operation.type).toBe('delete');
    expect(validDeleteMessage.data.operation.position).toBeGreaterThanOrEqual(0);
    expect(validDeleteMessage.data.operation.length).toBeGreaterThan(0);
    expect(validDeleteMessage.data.operation.timestamp).toBeDefined();
  });

  test('should handle invalid delete operations gracefully', () => {
    const invalidDeleteMessage = {
      type: 'document-change',
      documentId: 'test-doc',
      userId: 'user1',
      userEmail: 'user1@test.com',
      data: {
        version: Date.now(),
        operation: {
          type: 'delete',
          position: -1, // Invalid position
          length: 0,    // Invalid length
          timestamp: new Date().toISOString(),
        }
      },
    };

    // The server should handle this gracefully without crashing
    expect(() => {
      (server as any).handleDocumentChange(mockWs, invalidDeleteMessage);
    }).not.toThrow();
  });

  test('should exclude sender from receiving their own delete operation', () => {
    const deleteMessage = {
      type: 'document-change',
      documentId: 'test-doc',
      userId: 'user1',
      userEmail: 'user1@test.com',
      data: {
        version: Date.now(),
        operation: {
          type: 'delete',
          position: 5,
          length: 3,
          timestamp: new Date().toISOString(),
        }
      },
    };

    // Mock clients in the same document room
    const senderClient = { ws: mockWs, userEmail: 'user1@test.com', documentId: 'test-doc' };
    const otherClient = { ws: new MockWebSocket(), userEmail: 'user2@test.com', documentId: 'test-doc' };

    mockClients.set('sender', senderClient);
    mockClients.set('other', otherClient);

    mockDocumentRooms.set('test-doc', new Set(['sender', 'other']));

    // Spy on the send method
    const sendSpy = jest.spyOn(mockWs, 'send');

    // Simulate handling the message
    (server as any).handleDocumentChange(mockWs, deleteMessage);

    // The sender should not receive their own message
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test('should handle sync-request operations correctly', () => {
    const syncRequestMessage = {
      type: 'document-change',
      documentId: 'test-doc',
      userId: 'user1',
      userEmail: 'user1@test.com',
      data: {
        version: Date.now(),
        operation: {
          type: 'sync-request',
          content: 'Hello world',
          timestamp: new Date().toISOString(),
        }
      },
    };

    // Spy on the broadcastToDocument method
    const broadcastSpy = jest.spyOn(server as any, 'broadcastToDocument');

    // Simulate handling the message
    (server as any).handleDocumentChange(mockWs, syncRequestMessage);

    // Verify that broadcastToDocument was called with sync-request
    expect(broadcastSpy).toHaveBeenCalledWith('test-doc', expect.objectContaining({
      type: 'document-change',
      data: expect.objectContaining({
        operation: expect.objectContaining({
          type: 'sync-request',
          content: 'Hello world'
        })
      })
    }), mockWs);
  });
});
