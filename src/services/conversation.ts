import { qdrant, C } from '../lib/qdrant'
import { ConversationSession, Message, OrderState } from '../types'
import { logger } from '../lib/logger'

const SESSION_TTL = 2 * 60 * 60 * 1000 // 2 hours
const MAX_STORED_MESSAGES = 60
const CLEANUP_INTERVAL = 30 * 60 * 1000 // Run at most every 30 min
let lastCleanup = 0

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
    logger.error('conversation', 'retrieve error', { err: String(err) })
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
  if (session.messages.length > MAX_STORED_MESSAGES) {
    session.messages = session.messages.slice(-MAX_STORED_MESSAGES)
  }
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

// NOTE: No distributed locking. Concurrent writes from multiple tabs/instances
// can cause message loss. Acceptable for single-user ordering flow.
// For WhatsApp integration, consider optimistic locking with a version field.

/** Lazy cleanup — deletes expired sessions from Qdrant. Runs at most every 30 min. */
export async function cleanupExpiredSessions(): Promise<void> {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  try {
    const result = await qdrant.scroll(C.sessions, {
      filter: {
        must: [{ key: 'lastActivity', range: { lt: now - SESSION_TTL } }],
      },
      limit: 100,
      with_payload: false,
    })

    if (result.points.length > 0) {
      const ids = result.points.map(p => p.id)
      await qdrant.delete(C.sessions, { points: ids })
      logger.info('conversation', `Cleaned up ${ids.length} expired sessions`)
    }
  } catch (err) {
    logger.error('conversation', 'Cleanup error', { err: String(err) })
  }
}
