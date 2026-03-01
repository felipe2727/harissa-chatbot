import OpenAI from 'openai';
import { Message } from '../types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FALLBACK_RESPONSE = JSON.stringify({
  reply: 'Disculpa, estamos teniendo problemas técnicos. Por favor intenta de nuevo en unos minutos 🙏',
  order_state: { items: [], total: 0, status: 'building' },
});

export async function callLLM(
  systemPrompt: string,
  messages: Message[]
): Promise<string> {
  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
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
    console.error('OpenAI API error (attempt 1):', error);

    try {
      await new Promise((r) => setTimeout(r, 1000));
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content || FALLBACK_RESPONSE;
    } catch (retryError) {
      console.error('OpenAI API error (attempt 2):', retryError);
      return FALLBACK_RESPONSE;
    }
  }
}
