import { ConversationSession, Message, OrderState } from '../types';

const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
const sessions = new Map<string, ConversationSession>();

export function getOrCreateSession(phoneNumber: string): ConversationSession {
  const existing = sessions.get(phoneNumber);
  if (existing && Date.now() - existing.lastActivity < SESSION_TTL) {
    existing.lastActivity = Date.now();
    return existing;
  }

  const session: ConversationSession = {
    phoneNumber,
    messages: [],
    currentOrder: { items: [], total: 0, status: 'building' },
    lastActivity: Date.now(),
  };
  sessions.set(phoneNumber, session);
  return session;
}

export function addMessage(
  session: ConversationSession,
  role: Message['role'],
  content: string
): void {
  session.messages.push({ role, content });
  session.lastActivity = Date.now();
}

export function updateOrder(
  session: ConversationSession,
  order: OrderState
): void {
  session.currentOrder = order;
}

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastActivity > SESSION_TTL) {
      sessions.delete(key);
    }
  }
}, 5 * 60 * 1000);
