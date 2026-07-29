import { io, type Socket } from 'socket.io-client';

import { getApiBaseUrl, getToken } from '../../api/client';

export interface ChatSocketMessage {
  _id?: string;
  id?: string;
  sessionId?: string;
  role?: string;
  senderType?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSocketSession {
  _id?: string;
  id?: string;
  title?: string;
  status?: string;
  mode?: string | null;
  modeSource?: string;
  effectiveMode?: string;
  unreadByUser?: boolean;
  unreadByAdmin?: boolean;
  lastMessage?: string | ChatSocketMessage | null;
  lastMessageAt?: string | null;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ChatMessageCreatedEvent {
  sessionId?: string;
  message: ChatSocketMessage;
  emittedAt?: string;
}

export interface ChatSessionUpdatedEvent {
  sessionId?: string;
  session: ChatSocketSession;
  emittedAt?: string;
}

export interface ChatTypingEvent {
  sessionId?: string;
  isTyping?: boolean;
  actorType?: string;
  actorId?: string;
  timestamp?: string;
}

type ChatSocket = Socket;

let socket: ChatSocket | null = null;
let activeToken: string | null = null;

const getSocketUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_SOCKET_URL?.trim();
  return (configuredUrl || getApiBaseUrl()).replace(/\/api\/?$/, '');
};

export const getChatSocket = () => {
  const token = getToken();

  if (socket && activeToken === token) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  activeToken = token;
  socket = io(getSocketUrl(), {
    autoConnect: Boolean(token),
    auth: { token },
    transports: ['polling', 'websocket'],
    upgrade: true,
    timeout: 15000,
    reconnection: true,
  });

  return socket;
};

export const refreshChatSocketAuth = () => {
  const token = getToken();
  const current = getChatSocket();
  current.auth = { token };
  activeToken = token;

  if (token && !current.connected) current.connect();
  if (!token && current.connected) current.disconnect();

  return current;
};

export const joinChatSession = (sessionId: string) => {
  const current = refreshChatSocketAuth();
  if (!sessionId || !getToken()) return current;

  // The screen owns the connect listener so it can join again after every
  // reconnect without accumulating listeners inside this singleton service.

  return current;
};

export const leaveChatSession = (sessionId: string) => {
  if (!socket || !sessionId) return;
  socket.emit('chat:leave', { sessionId });
};

export const emitChatTyping = (sessionId: string, isTyping: boolean) => {
  const current = refreshChatSocketAuth();
  if (sessionId && current.connected) current.emit('chat:typing', { sessionId, isTyping });
};

export const emitChatRead = (sessionId: string) => {
  const current = refreshChatSocketAuth();
  if (sessionId && current.connected) current.emit('chat:read', { sessionId });
};

export const disconnectChatSocket = () => {
  if (socket) socket.disconnect();
  socket = null;
  activeToken = null;
};
