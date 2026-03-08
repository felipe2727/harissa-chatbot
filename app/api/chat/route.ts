import { NextRequest, NextResponse } from 'next/server'
import { bootstrapCollections, qdrant, C } from '../../../src/lib/qdrant'
import { getMenuData } from '../../../src/services/menu'
import { addMessage, getOrCreateSession, updateOrder } from '../../../src/services/conversation'
import { callLLM } from '../../../src/services/llm'
import { validateOrder } from '../../../src/services/order'
import { buildSystemPrompt } from '../../../src/prompts/system'
import { buildValidatorIndex, isIndexBuilt } from '../../../src/utils/validators'
import { LLMResponse, Reservation } from '../../../src/types'

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

    const { message, sessionId } = await req.json()

    if (!message || !sessionId) {
      return NextResponse.json({ error: 'Missing message or sessionId' }, { status: 400 })
    }

    // Load menu and build validator index if needed
    const menuData = await getMenuData()
    if (!isIndexBuilt()) {
      buildValidatorIndex(menuData)
    }

    const systemPrompt = buildSystemPrompt(menuData)

    // Add user message (creates session if needed)
    await addMessage(sessionId, 'user', message)

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

    // Save confirmed order to Qdrant
    if (validatedOrder.status === 'confirmed' && validatedOrder.items.length > 0) {
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
    }

    // Save reservation request to Qdrant
    if (parsed.reservation_request && parsed.reservation_request.customerName) {
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
    }

    return NextResponse.json({
      reply: parsed.reply,
      orderState: validatedOrder,
    })
  } catch (err) {
    console.error('[chat] error:', err)
    return NextResponse.json({
      reply: 'Disculpa, estamos teniendo problemas técnicos. Por favor intenta de nuevo 🙏',
      orderState: { items: [], total: 0, status: 'building' },
    })
  }
}
