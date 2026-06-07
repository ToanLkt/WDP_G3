import { chatApi } from '../api/chat';
import { extractApiResource } from '../api/client';
import { normalizeChatMessage, normalizeChatSession, normalizeChatSessions } from '../api/normalizers';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  createdAt: string;
  messages?: ChatMessage[];
}

const toMobileMessage = (message: ReturnType<typeof normalizeChatMessage>): ChatMessage => ({
  id: message.id,
  text: message.content,
  sender: message.role === 'user' ? 'user' : 'ai',
  timestamp: message.timestamp,
});

const toMobileSession = (session: ReturnType<typeof normalizeChatSession>): ChatSession => ({
  id: session.id,
  title: session.title,
  lastMessage: session.messages[session.messages.length - 1]?.content || '',
  createdAt: session.createdAt,
  messages: session.messages.map(toMobileMessage),
});

export const createChatSession = async (title: string): Promise<ChatSession> => {
  const payload = await chatApi.createSession(title);
  const session = normalizeChatSession(extractApiResource(payload, ['session', 'chatSession']));
  return toMobileSession(session);
};

export const fetchChatSessions = async (): Promise<ChatSession[]> => {
  const payload = await chatApi.getSessions();
  return normalizeChatSessions(payload).map(toMobileSession);
};

export const fetchChatSessionDetail = async (sessionId: string): Promise<ChatMessage[]> => {
  const payload = await chatApi.getSession(sessionId);
  const messagesPayload = extractApiResource<unknown[]>(payload, ['messages']);

  if (Array.isArray(messagesPayload)) {
    return messagesPayload.map((msg) => toMobileMessage(normalizeChatMessage(msg)));
  }

  const session = normalizeChatSession(extractApiResource(payload, ['session', 'chatSession']));
  return session.messages.map(toMobileMessage);
};

export const sendChatMessage = async (
  sessionId: string,
  message: string
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> => {
  const payload = await chatApi.sendMessage(sessionId, message);
  const data = extractApiResource<Record<string, unknown>>(payload, []);

  const userMsg = data?.userMessage;
  const assistantMsg = data?.assistantMessage;

  if (!assistantMsg) {
    throw new Error('No reply message returned from the AI Mentor.');
  }

  return {
    userMessage: toMobileMessage(normalizeChatMessage(userMsg || { content: message, role: 'user' })),
    assistantMessage: toMobileMessage(normalizeChatMessage(assistantMsg)),
  };
};
