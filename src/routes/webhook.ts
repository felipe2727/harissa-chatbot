import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getOrCreateSession,
  addMessage,
  updateOrder,
} from '../services/conversation';
import { callLLM } from '../services/llm';
import { validateOrder } from '../services/order';
import { buildSystemPrompt } from '../prompts/system';
import { LLMResponse } from '../types';

function parseLLMResponse(raw: string): LLMResponse {
  const emptyOrder = { items: [], total: 0, status: 'building' as const };

  // Try to extract JSON from ```json ... ``` block
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // Fall through
    }
  }

  // Try parsing the whole string as JSON
  try {
    return JSON.parse(raw);
  } catch {
    // Last resort: use raw text as reply
    return { reply: raw, order_state: emptyOrder };
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Build system prompt once at startup
const systemPrompt = buildSystemPrompt();

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/webhook',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, string>;
      const message = body.Body;
      const from = body.From;

      if (!message || !from) {
        return reply.status(400).send('Missing Body or From');
      }

      // 1. Get or create session
      const session = getOrCreateSession(from);

      // 2. Add user message to history
      addMessage(session, 'user', message);

      // 3. Call LLM with full conversation context
      const rawResponse = await callLLM(systemPrompt, session.messages);

      // 4. Parse structured response
      const parsed = parseLLMResponse(rawResponse);

      // 5. Validate prices server-side
      const validatedOrder = validateOrder(parsed.order_state);

      // 6. Store assistant response in history (raw for context continuity)
      addMessage(session, 'model', rawResponse);
      updateOrder(session, validatedOrder);

      // 7. Respond with TwiML
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(parsed.reply)}</Message></Response>`;
      return reply.type('text/xml').send(twiml);
    }
  );
}
