# Härissa Foods — WhatsApp Ordering Chatbot

## Plan de implementación para Claude Code

---

## 1. Visión General

Chatbot de WhatsApp para **Härissa Foods** (restaurante mediterráneo en Colombia) que maneja pedidos en lenguaje natural en español. No es un bot basado en nodos/flujos rígidos — usa un LLM para interpretar mensajes conversacionales y gestionar el estado del pedido.

**Ejemplo de interacción:**
```
Cliente: "Hola, quiero un bowl árabe y un shawarma de pollo en pan pita"
Bot: "¡Hola! Con gusto 😊 Tengo tu pedido:
      1× Bowl Árabe — $59.900
      1× Shawarma de Pollo en Pan Pita — $44.900
      Subtotal: $104.800
      ¿Deseas agregar algo más o confirmar tu pedido?"

Cliente: "Agrégale papas al shawarma"
Bot: "Listo, combo con papas fritas al shawarma (+$8.900).
      Subtotal actualizado: $113.700
      ¿Algo más?"

Cliente: "Eso es todo"
Bot: "Perfecto. Tu pedido está confirmado:
      1× Bowl Árabe — $59.900
      1× Shawarma de Pollo en Pan Pita + Papas — $53.800
      Total: $113.700
      ¡Gracias por tu pedido! Te avisaremos cuando esté listo 🙌"
```

---

## 2. Stack Tecnológico

### 2.1 LLM: Gemini 2.0 Flash (Google)

**¿Por qué Gemini 2.0 Flash?**
- **Precio imbatible**: $0.10/1M input, $0.40/1M output (via Google AI Studio)
- **Excelente español**: Entrenado multilingüe, maneja español latino con naturalidad
- **Rápido**: Baja latencia, ideal para chat en tiempo real
- **1M context window**: Sobra para incluir el menú completo en el system prompt
- **Comparativa de costos por 10,000 conversaciones/día** (~500 tokens c/u):

| Modelo             | Input $/1M | Output $/1M | Costo diario estimado |
|--------------------|-----------:|------------:|----------------------:|
| Gemini 2.0 Flash   |     $0.10  |      $0.40  |              ~$1.25   |
| GPT-4o Mini        |     $0.15  |      $0.60  |              ~$1.90   |
| Claude Haiku 3.5   |     $0.80  |      $4.00  |              ~$12.00  |

**Fallback**: Si Gemini falla o hay latencia alta, puedes swap a GPT-4o Mini con cambio mínimo (misma interfaz OpenAI-compatible).

### 2.2 WhatsApp: Twilio Sandbox → Producción

**Para testear AHORA MISMO (sandbox):**
1. Crear cuenta gratis en [twilio.com](https://www.twilio.com/try-twilio)
2. Ir a Console → Messaging → Try it Out → Send a WhatsApp Message
3. Escanear QR o enviar `join <tu-código>` al número sandbox `+1 415 523 8886`
4. Configurar webhook URL apuntando a tu servidor

**Para producción:** Registrar WhatsApp Business sender (se hace después).

### 2.3 Tunnel: ngrok (para desarrollo)

Para que Twilio pueda llegar a tu máquina local:
```bash
ngrok http 3000
```
Eso da una URL pública tipo `https://abc123.ngrok-free.app` que pegas en Twilio como webhook.

**Alternativa gratis sin cuenta**: `npx localtunnel --port 3000` o Cloudflare Tunnel.

### 2.4 Runtime: Node.js + Fastify

- **Fastify** sobre Express: más rápido, schema validation built-in, mejor DX
- TypeScript para type safety
- Simple y liviano — un solo servidor que recibe webhooks de Twilio y responde

---

## 3. Arquitectura

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ WhatsApp │────▶│  Twilio   │────▶│  Tu Server   │────▶│ Gemini Flash │
│ (cliente)│◀────│ Sandbox   │◀────│  (Fastify)   │◀────│   (LLM)      │
└──────────┘     └──────────┘     └──────────────┘     └──────────────┘
                                        │
                                        ▼
                                  ┌──────────┐
                                  │  State    │
                                  │  (Redis   │
                                  │  o Map)   │
                                  └──────────┘
```

### Flujo:
1. Cliente envía mensaje por WhatsApp
2. Twilio hace POST a tu webhook `/api/webhook`
3. Tu server obtiene el `From` (número del cliente) y `Body` (mensaje)
4. Carga el historial de conversación de ese número (state store)
5. Envía al LLM: system prompt + menú JSON + historial + mensaje nuevo
6. LLM responde con texto para el cliente + JSON estructurado del pedido
7. Server parsea la respuesta, actualiza el estado, responde a Twilio con TwiML

---

## 4. Estructura del Proyecto

```
harissa-bot/
├── src/
│   ├── index.ts                 # Entry point, Fastify server
│   ├── routes/
│   │   └── webhook.ts           # POST /api/webhook (Twilio incoming)
│   ├── services/
│   │   ├── llm.ts               # Wrapper para Gemini API
│   │   ├── conversation.ts      # Manejo de estado por sesión
│   │   └── order.ts             # Lógica de pedidos y cálculos
│   ├── prompts/
│   │   └── system.ts            # System prompt del bot
│   ├── data/
│   │   └── menu.json            # El JSON del menú (ya lo tienes)
│   └── utils/
│       ├── format.ts            # Formateo de precios COP, resúmenes
│       └── validators.ts        # Validación de items, precios
├── .env                         # TWILIO_SID, TWILIO_TOKEN, GEMINI_KEY
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. Componentes Clave

### 5.1 System Prompt (el cerebro del bot)

Este es el componente más importante. El system prompt debe:

```typescript
// src/prompts/system.ts

export function buildSystemPrompt(menuJson: string): string {
  return `
Eres el asistente virtual de Härissa Foods, un restaurante de comida 
mediterránea moderna en Colombia. Tu ÚNICO propósito es ayudar a los 
clientes a hacer pedidos del menú.

## REGLAS ESTRICTAS:
1. SOLO puedes tomar pedidos del menú proporcionado abajo. Si un cliente 
   pide algo que NO está en el menú, dile amablemente que no lo manejas.
2. Si el cliente pregunta algo NO relacionado con el restaurante o su pedido
   (política, clima, tareas, etc.), responde EXACTAMENTE:
   "Lo siento, solo puedo ayudarte con pedidos de Härissa Foods 😊 
   ¿Te gustaría ver nuestro menú?"
3. Siempre responde en español colombiano natural, amigable y conciso.
4. Los precios están en pesos colombianos (COP). Muéstralos como $XX.XXX
5. Cuando el cliente agrega items, muestra un resumen actualizado.
6. Cuando el cliente confirma, muestra el pedido final con total.
7. Si un plato tiene variantes (Grande/Media), pregunta cuál prefiere.
8. Si un plato tiene el builder (Arma tu Bowl/Arma tu Shawarma), 
   guía al cliente paso a paso por las opciones.
9. Sugiere combos o extras relevantes (ej: "¿Le agregas papas fritas 
   por +$8.900?") pero no seas insistente.
10. Puedes usar emojis con moderación.

## FORMATO DE RESPUESTA:
Responde SIEMPRE en este formato JSON envuelto en un bloque:
\`\`\`json
{
  "reply": "Texto que ve el cliente en WhatsApp",
  "order_state": {
    "items": [
      {
        "id": "sp-02",
        "name": "Shawarma de Pollo",
        "quantity": 1,
        "unit_price": 44900,
        "modifiers": [],
        "subtotal": 44900
      }
    ],
    "total": 44900,
    "status": "building" // building | confirmed | cancelled
  }
}
\`\`\`

## MENÚ COMPLETO:
${menuJson}
`;
}
```

**¿Por qué structured output?** Para que tu server pueda:
- Trackear el pedido real con precios verificados
- Validar que los items existen en el menú
- No depender de regex frágil para extraer info del texto libre

### 5.2 Manejo de Estado (Conversación)

```typescript
// src/services/conversation.ts

interface ConversationState {
  phoneNumber: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentOrder: OrderState;
  lastActivity: number;
  // Expira después de 30 min de inactividad
}

// En desarrollo: simple Map en memoria
// En producción: Redis con TTL de 30 minutos
const sessions = new Map<string, ConversationState>();
```

**Decisión de diseño**: Enviar el historial COMPLETO de la conversación al LLM en cada request. Gemini Flash tiene 1M tokens de context — un chat de 50 mensajes + menú completo son ~4K tokens. No hay problema.

### 5.3 Webhook Handler

```typescript
// src/routes/webhook.ts

// Twilio envía POST con:
// - Body: texto del mensaje
// - From: "whatsapp:+57XXXXXXXXXX"
// - To: "whatsapp:+14155238886" (sandbox)

fastify.post('/api/webhook', async (request, reply) => {
  const { Body: message, From: from } = request.body;
  
  // 1. Obtener o crear sesión
  const session = getOrCreateSession(from);
  
  // 2. Agregar mensaje del usuario al historial
  session.messages.push({ role: 'user', content: message });
  
  // 3. Llamar al LLM
  const llmResponse = await callGemini(
    buildSystemPrompt(menuJson),
    session.messages
  );
  
  // 4. Parsear respuesta estructurada
  const parsed = parseResponse(llmResponse);
  
  // 5. Validar precios contra menú real (no confiar ciegamente en el LLM)
  const validated = validateOrder(parsed.order_state);
  
  // 6. Actualizar sesión
  session.messages.push({ role: 'assistant', content: llmResponse });
  session.currentOrder = validated;
  
  // 7. Responder a Twilio con TwiML
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${parsed.reply}</Message>
    </Response>`;
  
  reply.type('text/xml').send(twiml);
});
```

### 5.4 LLM Service (Gemini)

```typescript
// src/services/llm.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function callGemini(
  systemPrompt: string, 
  messages: Message[]
): Promise<string> {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });

  const chat = model.startChat({
    history: messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
  });

  const result = await chat.sendMessage(
    messages[messages.length - 1].content
  );
  
  return result.response.text();
}
```

### 5.5 Validación de Precios (Capa de seguridad)

**NUNCA confíes en el LLM para calcular precios.** El LLM sugiere items, tu código verifica:

```typescript
// src/services/order.ts

function validateOrder(llmOrder: OrderState): OrderState {
  const validated = { ...llmOrder, items: [], total: 0 };
  
  for (const item of llmOrder.items) {
    const menuItem = findMenuItemById(item.id);
    if (!menuItem) continue; // Item inventado por el LLM, ignorar
    
    const realPrice = getPrice(menuItem, item.modifiers);
    validated.items.push({
      ...item,
      unit_price: realPrice,
      subtotal: realPrice * item.quantity,
    });
    validated.total += realPrice * item.quantity;
  }
  
  return validated;
}
```

---

## 6. Setup Paso a Paso (para que funcione HOY)

### Paso 1: Crear cuentas (5 min)
```bash
# Twilio: https://www.twilio.com/try-twilio (gratis, trial da $15 USD)
# Google AI Studio: https://aistudio.google.com (API key gratis, generous free tier)
```

### Paso 2: Scaffold del proyecto
```bash
mkdir harissa-bot && cd harissa-bot
npm init -y
npm install fastify @google/generative-ai twilio dotenv
npm install -D typescript @types/node tsx
npx tsc --init
```

### Paso 3: Variables de entorno
```env
# .env
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=tu_auth_token
GEMINI_API_KEY=tu_api_key_de_google_ai_studio
PORT=3000
```

### Paso 4: Copiar `menu.json` a `src/data/`

### Paso 5: Implementar los archivos de la sección 5

### Paso 6: Correr y exponer
```bash
# Terminal 1: tu server
npx tsx src/index.ts

# Terminal 2: tunnel
ngrok http 3000
# Copia la URL https://xxxx.ngrok-free.app
```

### Paso 7: Conectar Twilio
1. Ve a Twilio Console → Messaging → Try it Out → WhatsApp Sandbox
2. En "WHEN A MESSAGE COMES IN", pega: `https://xxxx.ngrok-free.app/api/webhook`
3. Método: POST
4. Save

### Paso 8: Probar
1. Desde tu teléfono, envía `join <tu-código>` al +1 415 523 8886
2. Luego escribe: "Hola, quiero ver el menú"
3. El bot responde 🎉

---

## 7. Manejo de Casos Edge

| Caso | Estrategia |
|------|-----------|
| Cliente pide algo fuera del menú | "Lo siento, no manejamos X. ¿Puedo ayudarte con algo de nuestro menú?" |
| Cliente pregunta por ingredientes/alérgenos | Responder con la info disponible en el JSON (description) |
| Cliente quiere modificar un item ya agregado | El LLM actualiza `order_state` con el cambio |
| Cliente dice groserías | Respuesta amable ignorando, redirige al pedido |
| Preguntas no relacionadas (clima, política, etc.) | Fallback: "Solo puedo ayudarte con pedidos de Härissa Foods" |
| Arma tu Bowl / Arma tu Shawarma | Bot guía paso a paso: "Elige tu base: 1) Arroz cúrcuma 2) Mix lechugas..." |
| Timeout de sesión (30 min sin actividad) | Limpiar sesión, tratar como nuevo cliente |
| Twilio rate limit (50 msg/día en trial) | Upgrade a cuenta paga (~$0.005/msg WhatsApp) |
| Gemini API falla | Retry 1x, luego: "Estamos teniendo problemas técnicos, intenta en unos minutos" |

---

## 8. Mejoras Futuras (post-MVP)

- **Redis** para persistir sesiones (multi-instancia)
- **Integración con POS** del restaurante (enviar pedido directo a cocina)
- **Pagos**: Link de pago (Wompi/MercadoPago) directo en WhatsApp
- **Imágenes del menú**: Enviar fotos de los platos cuando el cliente pregunta
- **Horarios**: Rechazar pedidos fuera de horario de atención
- **Analytics**: Dashboard con platos más pedidos, hora pico, etc.
- **Multi-idioma**: Detectar si el cliente escribe en inglés y responder en inglés
- **WhatsApp Business producción**: Registrar número propio del restaurante

---

## 9. Estimación de Costos Mensuales (producción ligera)

| Servicio | Costo estimado |
|----------|---------------|
| Twilio WhatsApp (500 msg/día) | ~$75/mes |
| Gemini Flash API (500 conv/día) | ~$15/mes |
| Hosting (Railway/Render) | ~$5-7/mes |
| ngrok (solo desarrollo) | Gratis |
| Redis (Upstash free tier) | Gratis |
| **Total** | **~$95/mes** |

---

## 10. Archivos para Implementar (orden de prioridad)

1. `src/index.ts` — Server Fastify con health check
2. `src/data/menu.json` — Ya existe
3. `src/prompts/system.ts` — System prompt (sección 5.1)
4. `src/services/llm.ts` — Wrapper Gemini (sección 5.4)
5. `src/services/conversation.ts` — State management (sección 5.2)
6. `src/services/order.ts` — Validación de pedidos (sección 5.5)
7. `src/routes/webhook.ts` — Webhook handler (sección 5.3)
8. `src/utils/format.ts` — Formateo de precios
9. `.env` — Credenciales

---

**NOTA**: Este plan está diseñado para ser ejecutado por Claude Code en VS Code. Cada sección tiene suficiente contexto y código de referencia para que el agente implemente archivo por archivo. Alimenta este documento como prompt inicial junto con el `menu.json`.
