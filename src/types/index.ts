export interface Message {
  role: 'user' | 'model';
  content: string;
}

export interface OrderModifier {
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  name: string;
  variant?: string;
  quantity: number;
  unit_price: number;
  modifiers: OrderModifier[];
  subtotal: number;
}

export interface OrderState {
  items: OrderItem[];
  total: number;
  status: 'building' | 'confirmed' | 'cancelled';
}

export interface LLMResponse {
  reply: string;
  order_state: OrderState;
}

export interface ConversationSession {
  phoneNumber: string;
  messages: Message[];
  currentOrder: OrderState;
  lastActivity: number;
}
