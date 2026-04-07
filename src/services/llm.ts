import OpenAI from 'openai';
import { Message } from '../types';
import { logger } from '../lib/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FALLBACK_RESPONSE = JSON.stringify({
  reply: 'Disculpa, estamos teniendo problemas técnicos. Por favor intenta de nuevo en unos minutos 🙏',
  order_state: { items: [], total: 0, status: 'building' },
});

const MAX_HISTORY_MESSAGES = 30 // Last 15 exchanges (user + assistant)

export async function callLLM(
  systemPrompt: string,
  messages: Message[]
): Promise<string> {
  const recent = messages.length > MAX_HISTORY_MESSAGES
    ? messages.slice(-MAX_HISTORY_MESSAGES)
    : messages;

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...recent.map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: openaiMessages,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content || FALLBACK_RESPONSE;
  } catch (error) {
    logger.error('llm', 'OpenAI API error (attempt 1)', { err: String(error) });

    try {
      await new Promise((r) => setTimeout(r, 1000));
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content || FALLBACK_RESPONSE;
    } catch (retryError) {
      logger.error('llm', 'OpenAI API error (attempt 2)', { err: String(retryError) });
      return FALLBACK_RESPONSE;
    }
  }
}
