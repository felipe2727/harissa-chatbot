import { qdrant, C } from '../lib/qdrant'
import { ConversationSession, Message, OrderState } from '../types'

const SESSION_TTL = 30 * 60 * 1000 // 30 minutes

function isActive(lastActivity: number): boolean {
  return Date.now() - lastActivity < SESSION_TTL
}

export async function getOrCreateSession(
  sessionId: string
): Promise<ConversationSession> {
  try {
    const result = await qdrant.retrieve(C.sessions, {
      ids: [sessionId],
      with_payload: true,
    })

    if (result.length > 0 && result[0].payload) {
      const session = result[0].payload as unknown as ConversationSession
      if (isActive(session.lastActivity)) {
        return session
      }
    }
  } catch (err) {
    console.error('[conversation] retrieve error:', err)
  }

  // Create fresh session
  const session: ConversationSession = {
    sessionId,
    messages: [],
    currentOrder: { items: [], total: 0, status: 'building' },
    lastActivity: Date.now(),
  }
  await saveSession(session)
  return session
}

async function saveSession(session: ConversationSession): Promise<void> {
  await qdrant.upsert(C.sessions, {
    points: [
      {
        id: session.sessionId,
        vector: [0.0],
        payload: session as unknown as Record<string, unknown>,
      },
    ],
  })
}

export async function addMessage(
  sessionId: string,
  role: Message['role'],
  content: string
): Promise<void> {
  const session = await getOrCreateSession(sessionId)
  session.messages.push({ role, content })
  session.lastActivity = Date.now()
  await saveSession(session)
}

export async function updateOrder(
  sessionId: string,
  order: OrderState
): Promise<void> {
  const session = await getOrCreateSession(sessionId)
  session.currentOrder = order
  session.lastActivity = Date.now()
  await saveSession(session)
}
