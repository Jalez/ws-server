# WebSocket Server Setup - Information Request

This document outlines the information needed to properly configure the Socket.io + Express WebSocket server for document collaboration.

## 1. Application Context

### 1.1 App Purpose
- What type of application will use this WebSocket server? (e.g., text editor, drawing app, spreadsheet, etc.)
- Is this for internal use, public access, or both?
- Expected number of concurrent users?

### 1.2 Document Types
- What formats will documents be in? (plain text, rich text, JSON, binary, etc.)
- Average document size? Maximum document size?
- How are documents currently stored? (filesystem, database, cloud storage?)

## 2. Data Traffic Patterns

### 2.1 Message Types & Frequency
- What types of operations need real-time sync? (text changes, cursor position, selection, formatting, etc.)
- Expected message frequency per user? (e.g., typing speed, mouse movements)
- Are there bulk operations? (e.g., paste large text, undo/redo operations)

### 2.2 Operational Conflict Resolution
- How should conflicting edits be handled? (Operational Transformation, Conflict-free Replicated Data Types, Last-Write-Wins, etc.)
- Is there a master document state, or is it peer-to-peer?
- How should offline users be handled when they reconnect?

### 2.3 Data Payload Examples
Please provide examples of the data structures that will be sent:

**Text Edit Operation:**
```json
{
  "type": "text_edit",
  "documentId": "doc_123",
  "userId": "user_456",
  "operation": {
    "type": "insert|delete|update",
    "position": 42,
    "content": "Hello World"
  },
  "timestamp": 1640995200000
}
```

**User Presence:**
```json
{
  "type": "presence",
  "documentId": "doc_123",
  "userId": "user_456",
  "action": "join|leave|cursor_move",
  "cursor": { "line": 5, "column": 12 }
}
```

## 3. Authentication & Authorization

### 3.1 Authentication Method
- How are users authenticated? (JWT, session cookies, API keys, etc.)
- Where is the authentication handled? (frontend, separate auth service, this WebSocket server?)
- How long should WebSocket connections stay authenticated?

### 3.2 Document Permissions
- How are document access permissions determined?
- Are there different permission levels? (read, write, admin)
- How are permissions enforced? (per document, per user, per organization?)

## 4. Performance & Scaling

### 4.1 Connection Limits
- Expected number of concurrent connections?
- Peak hours/days for usage?
- Geographic distribution of users?

### 4.2 Performance Requirements
- Maximum acceptable latency for operations? (e.g., <100ms for text edits)
- Should operations be buffered/batched for performance?
- Any specific throughput requirements?

## 5. Security Requirements

### 5.1 Data Security
- Should messages be encrypted? (beyond standard TLS)
- Are there sensitive operations that need special handling?
- Any compliance requirements? (GDPR, HIPAA, etc.)

### 5.2 Rate Limiting
- Should there be rate limits per user/connection?
- How to handle abusive clients?
- DDoS protection requirements?

## 6. Integration Requirements

### 6.1 External Services
- Does the WebSocket server need to communicate with other services? (database, file storage, notifications, etc.)
- Are there existing APIs that need to be called?
- Webhook requirements for external notifications?

### 6.2 Monitoring & Logging
- What logging level is required? (debug, info, warn, error)
- Are there specific monitoring tools? (DataDog, New Relic, Prometheus, etc.)
- What metrics need to be tracked? (connections, messages, errors, latency)

## 7. Development & Deployment

### 7.1 Environment
- Development environment setup?
- Staging/production environment?
- Container requirements? (Docker, Kubernetes)

### 7.2 Version Control
- Existing Git repository?
- Branching strategy?
- CI/CD pipeline requirements?

---

**Please fill out as much of this information as possible. The more details provided, the better the WebSocket server can be tailored to your specific needs.**
