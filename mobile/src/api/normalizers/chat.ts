import type { ChatMessage, ChatSession } from '../../types';
import { asArray, asRecord, extractObject, firstString } from './helpers';

export const normalizeChatMessage = (payload: unknown): ChatMessage => {
  const message = asRecord(extractObject(payload, ['message', 'reply', 'assistantMessage', 'aiResponse', 'response']));
  const role = firstString(message.role, message.sender, message.type, message.author);

  return {
    id: firstString(message.id, message._id, `message-${Date.now()}`),
    role: ['user', 'human'].includes(role.toLowerCase()) ? 'user' : 'assistant',
    content: firstString(message.content, message.message, message.text, message.reply, message.response, message.aiResponse),
    timestamp: firstString(message.timestamp, message.createdAt, new Date().toISOString()),
  };
};

export const normalizeChatSession = (payload: unknown): ChatSession => {
  const session = asRecord(extractObject(payload, ['session', 'chatSession']));

  return {
    id: firstString(session.id, session._id, session.sessionId),
    title: firstString(session.title, session.name, 'Cuộc trò chuyện mới'),
    createdAt: firstString(session.createdAt, new Date().toISOString()),
    messages: asArray(session.messages).map(normalizeChatMessage),
    repositoryContext: firstString(session.repositoryContext) || undefined,
  };
};

export const normalizeChatSessions = (payload: unknown) => {
  return asArray(payload).map(normalizeChatSession);
};
