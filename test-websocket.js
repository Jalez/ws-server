#!/usr/bin/env node

// Test WebSocket connection to verify the server is working
// Run this to test the WebSocket connection from your frontend

const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'ws://localhost:3100';
const TEST_USER = {
  userId: 'test-user-123',
  userEmail: 'test@example.com',
  userName: 'Test User'
};

console.log('🧪 Testing WebSocket connection...');
console.log(`🌐 Connecting to: ${WS_URL}`);
console.log(`👤 Test user: ${TEST_USER.userEmail}`);
console.log('');

const ws = new WebSocket(WS_URL, {
  headers: {
    'Origin': 'http://localhost:3000' // Simulate frontend origin
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket connection opened!');
  console.log('');

  // Send authentication message
  console.log('🔐 Sending authentication...');
  const authMessage = {
    type: 'authenticate',
    userId: TEST_USER.userId,
    userEmail: TEST_USER.userEmail,
    userName: TEST_USER.userName
  };

  console.log('📤 Auth message:', JSON.stringify(authMessage, null, 2));
  ws.send(JSON.stringify(authMessage));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 Received message:');
  console.log(JSON.stringify(message, null, 2));
  console.log('');

  // If authentication was successful, try to join a test document
  if (message.type === 'authenticated') {
    console.log('✅ Authentication successful!');

    setTimeout(() => {
      console.log('📝 Joining test document...');
      const joinMessage = {
        type: 'join-document',
        documentId: 'test-doc-123',
        userId: TEST_USER.userId,
        userEmail: TEST_USER.userEmail,
        userName: TEST_USER.userName
      };

      console.log('📤 Join message:', JSON.stringify(joinMessage, null, 2));
      ws.send(JSON.stringify(joinMessage));
    }, 1000);
  }

  // If session was created, test is successful
  if (message.type === 'session-created') {
    console.log('🎉 Test successful! WebSocket server is working correctly.');
    console.log('');

    setTimeout(() => {
      console.log('🏁 Closing test connection...');
      ws.close();
    }, 2000);
  }
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Connection closed (code: ${code}, reason: ${reason.toString()})`);
  console.log('✅ Test completed!');
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
  console.log('');
  console.log('🔍 Troubleshooting:');
  console.log('1. Check if the WebSocket server is running: ./status-docker.sh');
  console.log('2. Check server logs: ./tail-logs.sh');
  console.log('3. Verify the WebSocket URL is correct');
  console.log('4. Check if there are any CORS issues');
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏰ Test timeout - closing connection');
  ws.close();
}, 10000);

console.log('⏳ Connecting... (this may take a few seconds)');

// Graceful exit
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  ws.close();
  process.exit(0);
});

