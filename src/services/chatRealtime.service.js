let io = null;

const roomName = (sessionId) => `chat-session:${sessionId}`;

const setSocketServer = (socketServer) => {
  io = socketServer;
};

const emitToSession = (sessionId, event, payload = {}) => {
  if (!io || !sessionId) return;
  io.to(roomName(sessionId)).emit(event, {
    ...payload,
    sessionId: String(sessionId),
    emittedAt: new Date().toISOString(),
  });
};

const emitMessageCreated = ({ sessionId, message }) => {
  emitToSession(sessionId, 'chat:message_created', { message });
};

const emitSessionUpdated = ({ sessionId, session }) => {
  emitToSession(sessionId, 'chat:session_updated', { session });
};

const emitReadUpdated = ({ sessionId, session, actor }) => {
  emitToSession(sessionId, 'chat:read_updated', { session, actor });
};

module.exports = {
  emitMessageCreated,
  emitReadUpdated,
  emitSessionUpdated,
  roomName,
  setSocketServer,
};
