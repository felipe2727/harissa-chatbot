import { OrderState, OrderItem } from '../types';
import { findItemById, getItemPrice, getModifierPrice } from '../utils/validators';

export function validateOrder(llmOrder: OrderState): OrderState {
  const validatedItems: OrderItem[] = [];
  let total = 0;

  for (const item of llmOrder.items) {
    // Custom builder items: all pricing comes from validated modifiers, not LLM unit_price
    if (item.id === 'custom-bowl' || item.id === 'custom-shawarma') {
      let modifierTotal = 0;
      const validatedModifiers = item.modifiers.map((mod) => {
        const prefix = item.id === 'custom-bowl' ? 'bowl:' : 'shawarma:';
        const realPrice =
          getModifierPrice(prefix + mod.name.toLowerCase()) ??
          getModifierPrice(mod.name.toLowerCase());
        if (realPrice === undefined) {
          console.warn(`[order] Unknown modifier rejected: "${mod.name}" for ${item.id}`);
        }
        const safePrice = realPrice ?? 0;
        modifierTotal += safePrice;
        return { name: mod.name, price: safePrice };
      });

      const subtotal = modifierTotal * item.quantity;
      validatedItems.push({
        ...item,
        unit_price: 0,
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
      const realModPrice = getModifierPrice(mod.name.toLowerCase());
      if (realModPrice === undefined) {
        console.warn(`[order] Unknown modifier rejected for ${item.id}: "${mod.name}"`);
      }
      const safePrice = realModPrice ?? 0;
      modifierTotal += safePrice;
      return { name: mod.name, price: safePrice };
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
