var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const redis = require('redis');
// const { createAdapter } = require('@socket.io/redis-adapter');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// Create HTTP server for Socket.io
const server = createServer(app);

// Configure Winston logger
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'websocket-server' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Configure Socket.io with Redis adapter for scaling
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  // adapter: createAdapter(redisClient)
});

// Rate limiting middleware
const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// JWT authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    socket.userId = decoded.userId || decoded.email;
    socket.userName = decoded.name || decoded.userId;
    socket.userEmail = decoded.email || decoded.userId;
    
    winstonLogger.info('User authenticated', { 
      userId: socket.userId, 
      socketId: socket.id 
    });
    
    next();
  } catch (error) {
    winstonLogger.error('Authentication failed', { 
      error: error.message, 
      socketId: socket.id 
    });
    next(new Error('Authentication error: Invalid token'));
  }
};

// Document collaboration state management
const documentStates = new Map(); // documentId -> { content, version, sessions }
const userSessions = new Map(); // socketId -> { documentId, userId, permissions }

// Socket.io connection handling
io.use(authenticateSocket);

io.on('connection', (socket) => {
  winstonLogger.info('User connected', { 
    userId: socket.userId, 
    socketId: socket.id 
  });

  // Join document room
  socket.on('join_document', async (data) => {
    try {
      const { documentId, permissions = 'viewer' } = data;
      
      // Check permissions (you'll need to implement your permission logic)
      const hasPermission = await checkDocumentPermission(socket.userId, documentId, permissions);
      
      if (!hasPermission) {
        socket.emit('error', { type: 'permission_denied', message: 'Insufficient permissions' });
        return;
      }

      // Join the document room
      socket.join(documentId);
      
      // Track user session
      userSessions.set(socket.id, { 
        documentId, 
        userId: socket.userId, 
        permissions,
        userName: socket.userName
      });

      // Initialize document state if not exists
      if (!documentStates.has(documentId)) {
        documentStates.set(documentId, {
          content: '',
          version: 0,
          sessions: new Set()
        });
      }

      const docState = documentStates.get(documentId);
      docState.sessions.add(socket.id);

      // Send current document state
      socket.emit('document_state', {
        documentId,
        content: docState.content,
        version: docState.version,
        timestamp: Date.now()
      });

      // Notify others about new user
      socket.to(documentId).emit('user_joined', {
        userId: socket.userId,
        userName: socket.userName,
        timestamp: Date.now()
      });

      winstonLogger.info('User joined document', { 
        userId: socket.userId, 
        documentId, 
        socketId: socket.id 
      });

    } catch (error) {
      winstonLogger.error('Error joining document', { 
        error: error.message, 
        userId: socket.userId, 
        documentId: data.documentId 
      });
      socket.emit('error', { type: 'join_failed', message: error.message });
    }
  });

  // Handle text edit operations
  socket.on('text_edit', (data) => {
    try {
      const { documentId, operation } = data;
      const session = userSessions.get(socket.id);
      
      if (!session || session.documentId !== documentId || session.permissions === 'viewer') {
        socket.emit('error', { type: 'permission_denied', message: 'Cannot edit document' });
        return;
      }

      const docState = documentStates.get(documentId);
      if (!docState) {
        socket.emit('error', { type: 'document_not_found' });
        return;
      }

      // Apply operation (simplified - you'll want to implement proper OT)
      operation.version = docState.version + 1;
      docState.version = operation.version;
      
      // Broadcast to all clients in the document room (including sender)
      io.to(documentId).emit('text_edit', {
        type: 'text_edit',
        documentId,
        userId: socket.userId,
        userName: socket.userName,
        operation,
        timestamp: Date.now()
      });

      winstonLogger.debug('Text edit operation', { 
        userId: socket.userId, 
        documentId, 
        operationType: operation.type 
      });

    } catch (error) {
      winstonLogger.error('Error processing text edit', { 
        error: error.message, 
        userId: socket.userId 
      });
    }
  });

  // Handle cursor position updates
  socket.on('cursor_update', (data) => {
    const { documentId, cursor, selection } = data;
    const session = userSessions.get(socket.id);
    
    if (!session || session.documentId !== documentId) {
      return;
    }

    // Broadcast cursor position to other clients
    socket.to(documentId).emit('cursor_update', {
      type: 'presence',
      documentId,
      userId: socket.userId,
      userName: socket.userName,
      action: 'cursor_move',
      cursor,
      selection,
      timestamp: Date.now()
    });
  });

  // Handle document synchronization
  socket.on('sync_request', (data) => {
    const { documentId } = data;
    const docState = documentStates.get(documentId);
    
    if (docState) {
      socket.emit('document_sync', {
        type: 'document_sync',
        documentId,
        version: docState.version,
        content: docState.content,
        timestamp: Date.now()
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const session = userSessions.get(socket.id);
    
    if (session) {
      const { documentId, userId, userName } = session;
      
      // Remove from document sessions
      const docState = documentStates.get(documentId);
      if (docState) {
        docState.sessions.delete(socket.id);
        
        // Clean up empty documents
        if (docState.sessions.size === 0) {
          documentStates.delete(documentId);
        }
      }
      
      // Notify others about user leaving
      socket.to(documentId).emit('user_left', {
        userId,
        userName,
        timestamp: Date.now()
      });
      
      userSessions.delete(socket.id);
    }
    
    winstonLogger.info('User disconnected', { 
      userId: socket.userId, 
      socketId: socket.id 
    });
  });

  // Error handling
  socket.on('error', (error) => {
    winstonLogger.error('Socket error', { 
      error: error.message, 
      userId: socket.userId, 
      socketId: socket.id 
    });
  });
});

// Permission checking function (implement based on your database)
async function checkDocumentPermission(userId, documentId, requiredPermission) {
  // This is a placeholder - implement based on your permission system
  // Should check against your PostgreSQL database
  return true; // Allow all for now
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// middleware
app.use(logger('dev'));
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(rateLimitMiddleware);
app.use(express.json({ limit: '10mb' })); // Support large documents
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// routes
app.use('/', indexRouter);
app.use('/users', usersRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    connections: io.engine.clientsCount 
  });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  winstonLogger.error('HTTP Error', { 
    error: err.message, 
    status: err.status || 500,
    stack: err.stack 
  });
  
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = { app, server };
