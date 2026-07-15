const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const chatService = read('src/services/chat.service.js');
const socketService = read('src/services/socket.service.js');
const realtimeService = read('src/services/chatRealtime.service.js');
const server = read('server.js');
const chatController = read('src/controllers/chat.controller.js');
const adminController = read('src/controllers/admin.controller.js');
const chatSessionModel = read('src/models/ChatSession.js');
const packageJson = require(path.join(root, 'package.json'));

const includes = (content, pattern, label) => {
  assert(
    content.includes(pattern),
    `${label} missing required pattern: ${pattern}`
  );
};

includes(packageJson.dependencies ? JSON.stringify(packageJson.dependencies) : '', 'socket.io', 'socket.io production dependency');
includes(server, "const http = require('http');", 'server http integration');
includes(server, 'const server = http.createServer(app);', 'server http integration');
includes(server, 'initSocket(server);', 'server socket attach');
assert(!server.includes('app.listen(PORT'), 'server must not use app.listen after Socket.IO integration');

[
  "const { Server } = require('socket.io');",
  "socket.handshake?.auth?.token",
  "socket.handshake?.headers?.authorization",
  'jwt.verify(token, process.env.JWT_SECRET)',
  'RevokedToken.findOne({ token })',
  "User.findById(userId).select('email role status').lean()",
  "socket.authUser = {",
  "socket.on('chat:join'",
  "socket.on('chat:leave'",
  "socket.on('chat:typing'",
  "socket.on('chat:read'",
  'findAuthorizedSession(socket, payload.sessionId)',
  'String(session.userId) !== String(socket.authUser.userId)',
  "socket.authUser?.role === 'admin'",
  "chatRealtime.roomName(session._id)",
  "socket.to(chatRealtime.roomName(sessionId)).emit('chat:typing'",
  'ChatSession.findByIdAndUpdate(',
  'unreadByAdmin: false',
  'unreadByUser: false',
].forEach((pattern) => includes(socketService, pattern, 'socket.service'));

includes(realtimeService, "io.to(roomName(sessionId)).emit(event", 'chatRealtime emit');
includes(realtimeService, "emitMessageCreated", 'chatRealtime message emit');
includes(realtimeService, "emitSessionUpdated", 'chatRealtime session emit');
includes(realtimeService, "emitReadUpdated", 'chatRealtime read emit');

[
  'lastResponseAt',
  "const chatRealtime = require('./chatRealtime.service');",
  'chatRealtime.emitMessageCreated({ sessionId: session._id, message: serializedUserMessage });',
  'chatRealtime.emitMessageCreated({ sessionId: session._id, message: serializedAssistantMessage });',
  'chatRealtime.emitMessageCreated({ sessionId: session._id, message: serializedAdminMessage });',
  'chatRealtime.emitSessionUpdated({ sessionId: session._id, session: serializedSession });',
  'session.lastResponseAt = session.lastMessageAt;',
  'buildMessageResponse',
  'buildSessionResponse',
].forEach((pattern) => includes(chatService, pattern, 'chat.service'));

includes(chatSessionModel, 'lastResponseAt', 'ChatSession model');
includes(chatService, "ChatSession.find({ modeSource: 'GLOBAL', closedAt: null })", 'global mode realtime notify');

const userMessageCreateIndex = chatService.indexOf('const userMessage = await ChatMessage.create');
const serializedUserIndex = chatService.indexOf('const serializedUserMessage = buildMessageResponse');
const emitUserIndex = chatService.indexOf('chatRealtime.emitMessageCreated({ sessionId: session._id, message: serializedUserMessage });');
assert(userMessageCreateIndex >= 0 && serializedUserIndex > userMessageCreateIndex && emitUserIndex > serializedUserIndex,
  'user message must emit only after ChatMessage.create');

const manualSaveIndex = chatService.indexOf("if (effectiveMode === 'MANUAL')");
const manualSessionSaveIndex = chatService.indexOf('await session.save();', manualSaveIndex);
const manualSessionEmitIndex = chatService.indexOf('chatRealtime.emitSessionUpdated({ sessionId: session._id, session: serializedSession });', manualSaveIndex);
assert(manualSessionSaveIndex >= 0 && manualSessionEmitIndex > manualSessionSaveIndex,
  'manual session update must emit only after session.save');

const assistantCreateIndex = chatService.indexOf('const assistantMessage = await ChatMessage.create');
const emitAssistantIndex = chatService.indexOf('chatRealtime.emitMessageCreated({ sessionId: session._id, message: serializedAssistantMessage });');
assert(assistantCreateIndex >= 0 && emitAssistantIndex > assistantCreateIndex,
  'assistant message must emit only after ChatMessage.create');

const adminCreateIndex = chatService.indexOf('const adminMessage = await ChatMessage.create');
const emitAdminIndex = chatService.indexOf('chatRealtime.emitMessageCreated({ sessionId: session._id, message: serializedAdminMessage });');
assert(adminCreateIndex >= 0 && emitAdminIndex > adminCreateIndex,
  'admin message must emit only after ChatMessage.create');

const userBranch = chatService.slice(userMessageCreateIndex, assistantCreateIndex);
assert(!userBranch.includes('lastResponseAt ='), 'user message branch must not update lastResponseAt');

const emitMessageCount = (chatService.match(/emitMessageCreated/g) || []).length;
assert.strictEqual(emitMessageCount, 3, 'chat.service should emit message_created in exactly three paths: USER, AI, ADMIN');

assert(!chatController.includes('emitMessageCreated') && !chatController.includes('emitSessionUpdated'),
  'chat controller must not emit realtime events');
assert(!adminController.includes('emitMessageCreated') && !adminController.includes('emitSessionUpdated'),
  'admin controller must not emit realtime events');

console.log('Chat realtime integration static audit checks passed.');
