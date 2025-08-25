const { io } = require('socket.io-client');

console.log('Testing Socket.IO connection to localhost:3000...');

// Connect with authentication token (you'll need to generate a valid JWT)
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token-here' // You'll need to generate a valid JWT token
  }
});

socket.on('connect', () => {
  console.log('✅ Socket.IO connection opened successfully');
  console.log('Socket ID:', socket.id);
  console.log('Sending join_document message...');

  socket.emit('join_document', {
    documentId: 'test_doc',
    permissions: 'editor'
  });
});

socket.on('document_state', (data) => {
  console.log('📨 Received document_state:', data);
});

socket.on('user_joined', (data) => {
  console.log('📨 User joined:', data);
});

socket.on('error', (error) => {
  console.error('❌ Socket.IO error:', error);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  console.log('💡 Make sure you have a valid JWT token in the auth section');
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Socket.IO disconnected:', reason);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏰ Test timeout reached, closing connection...');
  socket.close();
}, 10000);
