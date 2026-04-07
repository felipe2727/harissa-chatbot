import { NextRequest, NextResponse } from 'next/server'
import { bootstrapCollections, qdrant, C } from '../../../src/lib/qdrant'
import { getMenuData } from '../../../src/services/menu'
import { addMessage, getOrCreateSession, updateOrder, cleanupExpiredSessions } from '../../../src/services/conversation'
import { callLLM } from '../../../src/services/llm'
import { validateOrder } from '../../../src/services/order'
import { buildSystemPrompt } from '../../../src/prompts/system'
import { buildValidatorIndex, isIndexBuilt } from '../../../src/utils/validators'
import { LLMResponse, Reservation } from '../../../src/types'
import { checkRateLimit } from '../../../src/lib/rate-limit'
import { sanitizeUserMessage } from '../../../src/utils/sanitize'
import { logger } from '../../../src/lib/logger'

// Bootstrap once per cold start
let ready = false
async function ensureReady() {
  if (ready) return
  await bootstrapCollections()
  ready = true
}

function parseLLMResponse(raw: string): LLMResponse {
  const emptyOrder = { items: [], total: 0, status: 'building' as const }

  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1])
    } catch { /* fall through */ }
  }

  try {
    return JSON.parse(raw)
  } catch {
    return { reply: raw, order_state: emptyOrder }
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureReady()
    cleanupExpiredSessions().catch(() => {}) // fire-and-forget

    const body = await req.json()
    const { message, sessionId } = body

    // --- Input validation ---
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const MAX_MESSAGE_LENGTH = 2000

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid message' }, { status: 400 })
    }
    if (!sessionId || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
      return NextResponse.json({ error: 'Missing or invalid sessionId' }, { status: 400 })
    }

    const trimmedMessage = message.trim()
    if (trimmedMessage.length === 0) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 })
    }
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    // --- Rate limiting ---
    const rateCheck = checkRateLimit(sessionId)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateCheck.retryAfterMs ?? 60000) / 1000)) } }
      )
    }

    // Load menu and build validator index if needed
    const menuData = await getMenuData()
    if (!isIndexBuilt()) {
      buildValidatorIndex(menuData)
    }

    const systemPrompt = buildSystemPrompt(menuData)

    // Sanitize and add user message (creates session if needed)
    const cleanMessage = sanitizeUserMessage(trimmedMessage)
    await addMessage(sessionId, 'user', cleanMessage)

    // Re-fetch session with updated messages for LLM call
    const updatedSession = await getOrCreateSession(sessionId)

    // Call LLM
    const rawResponse = await callLLM(systemPrompt, updatedSession.messages)

    // Parse response
    const parsed = parseLLMResponse(rawResponse)

    // Validate order prices
    const validatedOrder = validateOrder(parsed.order_state)

    // Store assistant response
    await addMessage(sessionId, 'model', rawResponse)
    await updateOrder(sessionId, validatedOrder)

    // Save confirmed order to Qdrant (non-fatal — user still gets their response)
    if (validatedOrder.status === 'confirmed' && validatedOrder.items.length > 0) {
      try {
        await qdrant.upsert(C.orders, {
          points: [{
            id: crypto.randomUUID(),
            vector: [0.0],
            payload: {
              session_id: sessionId,
              items: validatedOrder.items,
              total: validatedOrder.total,
              status: 'pending',
              created_at: new Date().toISOString(),
            },
          }],
        })
      } catch (err) {
        logger.error('chat', 'Failed to save order', { err: String(err) })
      }
    }

    // Save reservation request to Qdrant (non-fatal)
    if (parsed.reservation_request && parsed.reservation_request.customerName) {
      try {
        const res = parsed.reservation_request
        const reservation: Omit<Reservation, 'sessionId'> & { session_id: string; created_at: string } = {
          session_id: sessionId,
          customerName: res.customerName ?? '',
          customerPhone: res.customerPhone ?? '',
          partySize: res.partySize ?? 0,
          preferredDate: res.preferredDate ?? '',
          preferredTime: res.preferredTime ?? '',
          location: res.location ?? '',
          specialRequests: res.specialRequests,
          created_at: new Date().toISOString(),
        }
        await qdrant.upsert(C.reservations, {
          points: [{
            id: crypto.randomUUID(),
            vector: [0.0],
            payload: reservation as unknown as Record<string, unknown>,
          }],
        })
      } catch (err) {
        logger.error('chat', 'Failed to save reservation', { err: String(err) })
      }
    }

    return NextResponse.json({
      reply: parsed.reply,
      orderState: validatedOrder,
    })
  } catch (err) {
    logger.error('chat', 'Unhandled error', { err: String(err) })
    return NextResponse.json({
      reply: 'Disculpa, estamos teniendo problemas técnicos. Por favor intenta de nuevo 🙏',
      orderState: { items: [], total: 0, status: 'building' },
    })
  }
}
