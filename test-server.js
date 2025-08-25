// Simple test script to verify WebSocket server functionality
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3100';
const TEST_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0QGV4YW1wbGUuY29tIiwibmFtZSI6IlRlc3QgVXNlciIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTc1NjA3NDAzMCwiZXhwIjoxNzU2MDc3NjMwfQ.3F33WzlXPDFHLxjzyejIOAMnweCTpzi6CatnqEH2cbA";

console.log('Testing WebSocket server...');

// Test health endpoint
const http = require('http');

const testHealth = () => {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          console.log('✅ Health check passed:', health);
          resolve(true);
        } catch (error) {
          console.log('❌ Health check failed:', error.message);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ Health check failed:', error.message);
      resolve(false);
    });
  });
};

// Test WebSocket connection
const testWebSocket = () => {
  return new Promise((resolve) => {
    console.log('Testing WebSocket connection...');
    
    const socket = io(SERVER_URL, {
      auth: { token: TEST_TOKEN },
      timeout: 5000
    });
    
    socket.on('connect', () => {
      console.log('✅ WebSocket connection successful');
      
      // Test joining a document
      socket.emit('join_document', {
        documentId: 'test-doc-123',
        permissions: 'editor'
      });
      
      setTimeout(() => {
        socket.disconnect();
        resolve(true);
      }, 1000);
    });
    
    socket.on('connect_error', (error) => {
      console.log('❌ WebSocket connection failed:', error.message);
      resolve(false);
    });
    
    socket.on('error', (error) => {
      console.log('❌ WebSocket error:', error);
      resolve(false);
    });
  });
};

// Run tests
const runTests = async () => {
  console.log('🚀 Starting WebSocket server tests...\n');
  
  const healthOk = await testHealth();
  const wsOk = await testWebSocket();
  
  console.log('\n📊 Test Results:');
  console.log(`Health Endpoint: ${healthOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`WebSocket Connection: ${wsOk ? '✅ PASS' : '❌ FAIL'}`);
  
  if (healthOk && wsOk) {
    console.log('\n🎉 All tests passed! Your WebSocket server is ready.');
  } else {
    console.log('\n⚠️  Some tests failed. Check your server configuration.');
  }
  
  process.exit(0);
};

runTests();
