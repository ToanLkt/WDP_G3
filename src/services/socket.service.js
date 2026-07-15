const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const ChatSession = require('../models/ChatSession');
const RevokedToken = require('../models/RevokedToken');
const User = require('../models/User');
const { getAllowedFrontendOrigins } = require('../config/frontend');
const chatRealtime = require('./chatRealtime.service');
const { buildSessionResponse, getOrCreateChatSetting } = require('./chat.service');

const TYPING_THROTTLE_MS = 1200;
const MAX_TYPING_PAYLOAD_BYTES = 512;

const getTokenFromSocket = (socket) => {
  const authToken = socket.handshake?.auth?.token;
  if (authToken) return String(authToken).replace(/^Bearer\s+/i, '').trim();
  const header = socket.handshake?.headers?.authorization || '';
  if (String(header).startsWith('Bearer ')) return String(header).slice(7).trim();
  return '';
};

const sanitizeSocketError = (code, message) => ({ success: false, error: { code, message } });

const isAdminUser = (socket) => socket.authUser?.role === 'admin';

const getActor = (socket) => ({
  actorId: socket.authUser.userId,
  actorType: isAdminUser(socket) ? 'ADMIN' : 'USER',
  role: socket.authUser.role,
});

const findAuthorizedSession = async (socket, sessionId) => {
  if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) {
    const error = new Error('Invalid sessionId');
    error.code = 'INVALID_SESSION';
    throw error;
  }

  const session = await ChatSession.findById(sessionId).lean();
  if (!session) {
    const error = new Error('Chat session not found');
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  if (!isAdminUser(socket) && String(session.userId) !== String(socket.authUser.userId)) {
    const error = new Error('Forbidden');
    error.code = 'FORBIDDEN';
    throw error;
  }

  return session;
};

const handleAckError = (ack, error) => {
  const payload = sanitizeSocketError(error.code || 'SOCKET_ERROR', error.message || 'Socket error');
  if (typeof ack === 'function') return ack(payload);
  return null;
};

const initSocket = (httpServer) => {
  const allowedOrigins = getAllowedFrontendOrigins();
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
  });

  chatRealtime.setSocketServer(io);

  io.use(async (socket, next) => {
    try {
      const token = getTokenFromSocket(socket);
      if (!token) {
        const error = new Error('Authorization token is required');
        error.data = { code: 'UNAUTHORIZED' };
        return next(error);
      }
      if (!process.env.JWT_SECRET) {
        const error = new Error('JWT_SECRET is not configured');
        error.data = { code: 'SERVER_CONFIG_ERROR' };
        return next(error);
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const revokedToken = await RevokedToken.findOne({ token }).lean();
      if (revokedToken) {
        const error = new Error('Token has been logged out');
        error.data = { code: 'UNAUTHORIZED' };
        return next(error);
      }

      const userId = decoded.userId || decoded.id || decoded._id;
      if (!userId) {
        const error = new Error('Invalid token payload');
        error.data = { code: 'UNAUTHORIZED' };
        return next(error);
      }

      const user = await User.findById(userId).select('email role status').lean();
      if (!user || (user.status && user.status !== 'active')) {
        const error = new Error('Account is not active');
        error.data = { code: 'FORBIDDEN' };
        return next(error);
      }

      socket.authUser = {
        userId: String(user._id),
        role: user.role || decoded.role || 'student',
        email: user.email || decoded.email || '',
      };
      return next();
    } catch (error) {
      const authError = new Error('Invalid or expired token');
      authError.data = { code: 'UNAUTHORIZED' };
      return next(authError);
    }
  });

  io.on('connection', (socket) => {
    socket.data.lastTypingAtBySession = new Map();

    socket.on('chat:join', async (payload = {}, ack) => {
      try {
        const session = await findAuthorizedSession(socket, payload.sessionId);
        const room = chatRealtime.roomName(session._id);
        await socket.join(room);
        if (typeof ack === 'function') {
          ack({
            success: true,
            sessionId: String(session._id),
            joinedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        handleAckError(ack, error);
      }
    });

    socket.on('chat:leave', async (payload = {}, ack) => {
      try {
        const sessionId = String(payload.sessionId || '');
        if (!mongoose.Types.ObjectId.isValid(sessionId)) {
          const error = new Error('Invalid sessionId');
          error.code = 'INVALID_SESSION';
          throw error;
        }
        await socket.leave(chatRealtime.roomName(sessionId));
        if (typeof ack === 'function') {
          ack({ success: true, sessionId, leftAt: new Date().toISOString() });
        }
      } catch (error) {
        handleAckError(ack, error);
      }
    });

    socket.on('chat:typing', async (payload = {}, ack) => {
      try {
        if (Buffer.byteLength(JSON.stringify(payload || {}), 'utf8') > MAX_TYPING_PAYLOAD_BYTES) {
          const error = new Error('Typing payload is too large');
          error.code = 'PAYLOAD_TOO_LARGE';
          throw error;
        }

        const session = await findAuthorizedSession(socket, payload.sessionId);
        if ((session.status || 'active') === 'closed' || session.closedAt) {
          const error = new Error('Chat session is closed');
          error.code = 'CHAT_SESSION_CLOSED';
          throw error;
        }
        const sessionId = String(session._id);
        const now = Date.now();
        const lastTypingAt = socket.data.lastTypingAtBySession.get(sessionId) || 0;
        if (now - lastTypingAt < TYPING_THROTTLE_MS) {
          if (typeof ack === 'function') ack({ success: true, throttled: true, sessionId });
          return;
        }
        socket.data.lastTypingAtBySession.set(sessionId, now);

        socket.to(chatRealtime.roomName(sessionId)).emit('chat:typing', {
          sessionId,
          isTyping: Boolean(payload.isTyping),
          ...getActor(socket),
          timestamp: new Date().toISOString(),
        });
        if (typeof ack === 'function') ack({ success: true, sessionId });
      } catch (error) {
        handleAckError(ack, error);
      }
    });

    socket.on('chat:read', async (payload = {}, ack) => {
      try {
        const session = await findAuthorizedSession(socket, payload.sessionId);
        const update = isAdminUser(socket)
          ? { unreadByAdmin: false }
          : { unreadByUser: false };
        const updatedSession = await ChatSession.findByIdAndUpdate(
          session._id,
          { $set: update },
          { new: true }
        ).lean();
        const serialized = buildSessionResponse(updatedSession, await getOrCreateChatSetting());
        const actor = getActor(socket);
        chatRealtime.emitReadUpdated({ sessionId: session._id, session: serialized, actor });
        chatRealtime.emitSessionUpdated({ sessionId: session._id, session: serialized });
        if (typeof ack === 'function') {
          ack({ success: true, sessionId: String(session._id), session: serialized });
        }
      } catch (error) {
        handleAckError(ack, error);
      }
    });
  });

  return io;
};

module.exports = {
  initSocket,
};
