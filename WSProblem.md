# WebSocket Connection Issues - Documentation

## Problem History

### Issue 1: React Effect Race Condition (FIXED ✅)

**Problem**: WebSocket connection was never being established due to a race condition in React effect cleanup.

**Root Cause**:
- `useEffect` was running multiple times due to re-renders (normal React behavior)
- Each effect run set up a connection timer with 1-second delay
- Effect cleanup immediately set `mountedRef.current = false`
- When timer fired, connection was blocked because `mountedRef.current` was false

**Symptoms**:
- Console showed: `"websocket: Connection effect triggered"`
- But never showed: `"websocket: Connecting to WebSocket server:"`
- Connection status always showed as disconnected

**Fix Applied**:
- Added `connectionAttemptRef` to track active connection timers
- Clear existing connection attempts before setting up new ones
- Proper cleanup only when component actually unmounts
- Modified `useWebSocketCollaboration.ts` lines 330-360

**Result**: Frontend now successfully attempts WebSocket connections ✅

---

### Issue 2: Missing Server Response Messages (CURRENT PROBLEM 🔴)

**Problem**: WebSocket server receives messages but doesn't send required response messages back to client.

**Root Cause**:
- Server processes `authenticate` and `join-document` messages successfully
- But doesn't send the expected response messages back to client
- Client closes connection (code 1001) after not receiving responses

**Symptoms**:
- Server logs show: "User authenticated successfully"
- Server logs show: "Received message: join-document"
- But connection closes immediately after
- Frontend never receives confirmation messages
- Connection status remains disconnected

**Expected Message Flow**:

```
Client → Server: authenticate
Server → Client: authenticated (MISSING)
Client → Server: join-document
Server → Client: user-joined (MISSING)
Server → Client: session-created (MISSING)
```

**Current Server Logs**:
```
✅ WebSocket connection established
✅ User authenticated successfully
📨 Received message: join-document
🔌 Connection closed (code: 1001)
```

---

## Required Server Implementation

### 1. Authentication Response

**After receiving `authenticate` message, server must send:**

```json
{
  "type": "authenticated",
  "userId": "user@example.com",
  "userEmail": "user@example.com",
  "userName": "User Name",
  "timestamp": "2025-01-25T12:00:00.000Z"
}
```

### 2. Join Document Responses

**After receiving `join-document` message, server must send:**

```json
{
  "type": "user-joined",
  "userId": "user@example.com",
  "userEmail": "user@example.com",
  "userName": "User Name",
  "timestamp": "2025-01-25T12:00:00.000Z"
}
```

```json
{
  "type": "session-created",
  "data": {
    "sessionId": "session_1234567890_abc123def"
  },
  "timestamp": "2025-01-25T12:00:00.000Z"
}
```

### 3. Additional Response Messages

**For complete functionality, server should also send:**

- `document-change` - When other users make edits
- `cursor-update` - When other users move cursors
- `user-left` - When users disconnect
- `error` - For error conditions

---

## Implementation Steps

### Step 1: Update Server Message Handlers

In your WebSocket server, ensure these handlers send responses:

```typescript
// After authentication
case 'authenticate':
  // ... authentication logic ...
  ws.send(JSON.stringify({
    type: 'authenticated',
    userId: message.userId,
    userEmail: message.userEmail,
    userName: message.userName,
    timestamp: new Date().toISOString()
  }));
  break;

case 'join-document':
  // ... join document logic ...
  ws.send(JSON.stringify({
    type: 'user-joined',
    userId: message.userId,
    userEmail: message.userEmail,
    userName: message.userName,
    timestamp: new Date().toISOString()
  }));

  ws.send(JSON.stringify({
    type: 'session-created',
    data: { sessionId: session.id },
    timestamp: new Date().toISOString()
  }));
  break;
```

### Step 2: Test the Connection

After implementing responses, you should see:
- Connection stays alive (no code 1001 disconnects)
- Frontend shows "WS" with green dot (connected)
- Console shows: `"websocket: Message received:"` for each response

### Step 3: Handle Additional Message Types

For full collaboration features, implement handlers for:
- `document-change` → broadcast to other users
- `cursor-update` → broadcast cursor positions
- `leave-document` → clean up sessions

---

## Verification

**✅ Working Connection Indicators:**
- Server logs show response messages being sent
- Frontend console shows: `"websocket: Message received:"`
- Connection status shows green dot
- No connection closures with code 1001

**❌ Still Broken Indicators:**
- Connection closes immediately after join-document
- No response messages in server logs
- Frontend shows disconnected status

---

## Files Modified

- `apps/web/components/scriba/hooks/useWebSocketCollaboration.ts` - Fixed race condition
- Server implementation needs updates for response messages

---

## Next Steps

1. Update WebSocket server to send response messages
2. Test connection stability
3. Implement remaining message handlers for full collaboration features
4. Add error handling and reconnection logic
