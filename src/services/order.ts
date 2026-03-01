import { OrderState, OrderItem } from '../types';
import { findItemById, getItemPrice, getModifierPrice } from '../utils/validators';

export function validateOrder(llmOrder: OrderState): OrderState {
  const validatedItems: OrderItem[] = [];
  let total = 0;

  for (const item of llmOrder.items) {
    // Custom builder items: validate component prices individually
    if (item.id === 'custom-bowl' || item.id === 'custom-shawarma') {
      let modifierTotal = 0;
      const validatedModifiers = item.modifiers.map((mod) => {
        const prefix = item.id === 'custom-bowl' ? 'bowl:' : 'shawarma:';
        const realPrice =
          getModifierPrice(prefix + mod.name.toLowerCase()) ??
          getModifierPrice(mod.name.toLowerCase()) ??
          mod.price;
        modifierTotal += realPrice;
        return { name: mod.name, price: realPrice };
      });

      const subtotal = (item.unit_price + modifierTotal) * item.quantity;
      validatedItems.push({
        ...item,
        modifiers: validatedModifiers,
        subtotal,
      });
      total += subtotal;
      continue;
    }

    const menuItem = findItemById(item.id);
    if (!menuItem) continue; // LLM hallucinated an item

    const realUnitPrice = getItemPrice(item.id, item.variant);
    if (realUnitPrice === undefined) continue;

    let modifierTotal = 0;
    const validatedModifiers = item.modifiers.map((mod) => {
      const realModPrice = getModifierPrice(mod.name.toLowerCase()) ?? mod.price;
      modifierTotal += realModPrice;
      return { name: mod.name, price: realModPrice };
    });

    const subtotal = (realUnitPrice + modifierTotal) * item.quantity;
    validatedItems.push({
      ...item,
      unit_price: realUnitPrice,
      modifiers: validatedModifiers,
      subtotal,
    });
    total += subtotal;
  }

  return {
    items: validatedItems,
    total,
    status: llmOrder.status,
  };
}
