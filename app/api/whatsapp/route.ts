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
import crypto from 'crypto'

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
    try { return JSON.parse(jsonMatch[1]) } catch { /* fall through */ }
  }
  try { return JSON.parse(raw) } catch { return { reply: raw, order_state: emptyOrder } }
}

/** Convert a phone number like "whatsapp:+573128379713" to a stable UUID v5 */
function phoneToSessionId(phone: string): string {
  const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8' // UUID v5 DNS namespace
  const hash = crypto.createHash('sha1').update(NAMESPACE + phone).digest('hex')
  // Format as UUID v5
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-')
}

function twiml(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(req: NextRequest) {
  try {
    await ensureReady()
    cleanupExpiredSessions().catch(() => {})

    // Twilio sends form-urlencoded data
    const formData = await req.formData()
    const body = formData.get('Body')?.toString().trim() ?? ''
    const from = formData.get('From')?.toString() ?? ''

    if (!body || !from) {
      return twiml('No entendí tu mensaje, intenta de nuevo.')
    }

    // Derive a stable UUID from the phone number
    const sessionId = phoneToSessionId(from)

    // Input validation
    const MAX_MESSAGE_LENGTH = 2000
    const message = body.length > MAX_MESSAGE_LENGTH ? body.slice(0, MAX_MESSAGE_LENGTH) : body

    // Rate limiting
    const rateCheck = checkRateLimit(sessionId)
    if (!rateCheck.allowed) {
      return twiml('Estás enviando muchos mensajes. Espera un momento y vuelve a intentar.')
    }

    // Load menu
    const menuData = await getMenuData()
    if (!isIndexBuilt()) {
      buildValidatorIndex(menuData)
    }

    const systemPrompt = buildSystemPrompt(menuData)

    // Sanitize and store user message
    const cleanMessage = sanitizeUserMessage(message)
    await addMessage(sessionId, 'user', cleanMessage)

    const updatedSession = await getOrCreateSession(sessionId)
    const rawResponse = await callLLM(systemPrompt, updatedSession.messages)
    const parsed = parseLLMResponse(rawResponse)
    const validatedOrder = validateOrder(parsed.order_state)

    await addMessage(sessionId, 'model', rawResponse)
    await updateOrder(sessionId, validatedOrder)

    // Save confirmed order
    if (validatedOrder.status === 'confirmed' && validatedOrder.items.length > 0) {
      try {
        await qdrant.upsert(C.orders, {
          points: [{
            id: crypto.randomUUID(),
            vector: [0.0],
            payload: {
              session_id: sessionId,
              phone: from,
              items: validatedOrder.items,
              total: validatedOrder.total,
              status: 'pending',
              created_at: new Date().toISOString(),
            },
          }],
        })
      } catch (err) {
        logger.error('whatsapp', 'Failed to save order', { err: String(err) })
      }
    }

    // Save reservation
    if (parsed.reservation_request && parsed.reservation_request.customerName) {
      try {
        const res = parsed.reservation_request
        await qdrant.upsert(C.reservations, {
          points: [{
            id: crypto.randomUUID(),
            vector: [0.0],
            payload: {
              session_id: sessionId,
              phone: from,
              customerName: res.customerName ?? '',
              customerPhone: res.customerPhone ?? '',
              partySize: res.partySize ?? 0,
              preferredDate: res.preferredDate ?? '',
              preferredTime: res.preferredTime ?? '',
              location: res.location ?? '',
              specialRequests: res.specialRequests,
              created_at: new Date().toISOString(),
            } as unknown as Record<string, unknown>,
          }],
        })
      } catch (err) {
        logger.error('whatsapp', 'Failed to save reservation', { err: String(err) })
      }
    }

    return twiml(parsed.reply)
  } catch (err) {
    logger.error('whatsapp', 'Unhandled error', { err: String(err) })
    return twiml('Disculpa, estamos teniendo problemas técnicos. Intenta de nuevo en unos minutos.')
  }
}
