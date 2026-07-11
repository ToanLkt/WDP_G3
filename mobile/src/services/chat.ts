import { chatApi } from '../api/chat';
import { extractApiResource } from '../api/client';
import { normalizeChatMessage, normalizeChatSession, normalizeChatSessions } from '../api/normalizers';

export interface ChatMessage {
  id: string;
  text: string;
  /** 'user' | 'ai' | 'admin' */
  sender: 'user' | 'ai' | 'admin';
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  createdAt: string;
  messages?: ChatMessage[];
}

export interface SendMessageResult {
  userMessage: ChatMessage;
  /** null when effectiveMode is MANUAL (waiting for admin) */
  assistantMessage: ChatMessage | null;
  effectiveMode: 'AI_AUTO' | 'MANUAL' | string;
  status: 'active' | 'waiting_admin' | 'answered' | 'closed' | string;
}

const resolveSender = (role: string, senderType?: string): ChatMessage['sender'] => {
  if (senderType === 'ADMIN') return 'admin';
  if (senderType === 'USER' || role === 'user') return 'user';
  return 'ai';
};

const toMobileMessage = (message: ReturnType<typeof normalizeChatMessage>): ChatMessage => ({
  id: message.id,
  text: message.content,
  sender: resolveSender(message.role, (message as any).senderType),
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
): Promise<SendMessageResult> => {
  const payload = await chatApi.sendMessage(sessionId, message);
  const data = extractApiResource<Record<string, unknown>>(payload, []);

  const effectiveMode = String(data?.effectiveMode ?? data?.mode ?? 'AI_AUTO');
  const status = String(data?.status ?? 'active');
  const userMsg = data?.userMessage;
  const assistantMsg = data?.assistantMessage ?? data?.aiMessage;

  const userMessage = toMobileMessage(
    normalizeChatMessage(userMsg || { content: message, role: 'user', senderType: 'USER' })
  );

  // In MANUAL mode the backend returns no AI reply yet
  if (effectiveMode === 'MANUAL' || status === 'waiting_admin') {
    return { userMessage, assistantMessage: null, effectiveMode, status };
  }

  if (!assistantMsg) {
    throw new Error('No reply message returned from the AI Mentor.');
  }

  return {
    userMessage,
    assistantMessage: toMobileMessage(normalizeChatMessage(assistantMsg)),
    effectiveMode,
    status,
  };
};
