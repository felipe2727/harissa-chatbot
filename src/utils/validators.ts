import menuData from '../data/menu.json';

interface MenuEntry {
  id: string;
  name: string;
  category: string;
  price?: number;
  variants?: Array<{ size: string; price: number }>;
  trago?: number;
  botella?: number;
}

const itemIndex = new Map<string, MenuEntry>();
const modifierIndex = new Map<string, number>();

function indexItems(items: any[], category: string): void {
  for (const item of items) {
    if (!item.id) continue;
    const entry: MenuEntry = {
      id: item.id,
      name: item.name,
      category,
      price: item.price,
      variants: item.variants,
    };
    itemIndex.set(item.id, entry);
  }
}

function indexLicorSubcategory(items: any[], subcategory: string, startIdx: number): void {
  items.forEach((item: any, i: number) => {
    const id = `li-${subcategory}-${String(i + 1).padStart(2, '0')}`;
    itemIndex.set(id, {
      id,
      name: item.name,
      category: 'licores',
      trago: item.trago,
      botella: item.botella,
    });
  });
}

function indexVinoSubcategory(items: any[], subcategory: string): void {
  items.forEach((item: any, i: number) => {
    const id = `vi-${subcategory}-${String(i + 1).padStart(2, '0')}`;
    itemIndex.set(id, {
      id,
      name: item.name,
      category: 'vinos',
      price: item.price,
    });
  });
}

function buildIndices(): void {
  const menu = menuData.menu as any;

  // Categories with standard items array
  const standardCategories = [
    'mezzes', 'entradas', 'ensaladas', 'wraps', 'para_compartir',
    'picadas', 'parrilla', 'shawarmas_pan_pita', 'hamburguesas',
    'sides', 'postres', 'te_y_cafe', 'mocktails',
  ];

  for (const key of standardCategories) {
    if (menu[key]?.items) {
      indexItems(menu[key].items, key);
    }
  }

  // Bowls: predefined array
  if (menu.bowls?.predefined) {
    indexItems(menu.bowls.predefined, 'bowls');
  }

  // Crispy Shawarma
  if (menu.crispy_shawarma?.items) {
    indexItems(menu.crispy_shawarma.items, 'crispy_shawarma');
  }

  // Bebidas Frías: subcategories
  if (menu.bebidas_frias) {
    const bf = menu.bebidas_frias;
    for (const sub of ['sodas_de_la_casa', 'limonadas', 'bebidas', 'cervezas']) {
      if (bf[sub]) indexItems(bf[sub], 'bebidas_frias');
    }
  }

  // Cocktails: subcategories
  if (menu.cocktails) {
    for (const sub of ['de_la_casa', 'clasicos']) {
      if (menu.cocktails[sub]) indexItems(menu.cocktails[sub], 'cocktails');
    }
  }

  // Licores: subcategories without IDs
  if (menu.licores) {
    for (const sub of ['whisky', 'gin', 'tequila', 'mezcal', 'vodka', 'ron', 'digestivo']) {
      if (menu.licores[sub]) indexLicorSubcategory(menu.licores[sub], sub, 1);
    }
  }

  // Vinos: subcategories without IDs
  if (menu.vinos) {
    for (const sub of ['tinto', 'blanco', 'botella_personal_187ml', 'rosado', 'espumantes', 'sangria']) {
      if (menu.vinos[sub]) indexVinoSubcategory(menu.vinos[sub], sub);
    }
  }

  // --- Modifiers / Extras ---

  // Combo papas fritas (shared across several categories)
  modifierIndex.set('combo papas fritas', 8900);

  // Ensaladas: protein add-ons
  if (menu.ensaladas?.adicion_proteina) {
    for (const a of menu.ensaladas.adicion_proteina) {
      modifierIndex.set(a.name.toLowerCase(), a.price);
    }
  }

  // Hamburguesas: adiciones
  if (menu.hamburguesas?.adiciones) {
    for (const a of menu.hamburguesas.adiciones) {
      modifierIndex.set(a.name.toLowerCase(), a.price);
    }
  }

  // Wraps: toppings
  if (menu.wraps?.toppings) {
    for (const t of menu.wraps.toppings) {
      modifierIndex.set(t.name.toLowerCase(), t.price);
    }
  }

  // Arma tu Shawarma: extra toppings
  if (menu.arma_tu_shawarma?.step_3_toppings?.extras) {
    for (const e of menu.arma_tu_shawarma.step_3_toppings.extras) {
      modifierIndex.set(e.name.toLowerCase(), e.price);
    }
  }

  // Arma tu Bowl: extra toppings
  if (menu.bowls?.arma_tu_bowl?.toppings_extra) {
    for (const e of menu.bowls.arma_tu_bowl.toppings_extra) {
      modifierIndex.set(e.name.toLowerCase(), e.price);
    }
  }

  // Builder step options (for custom bowl/shawarma price validation)
  if (menu.bowls?.arma_tu_bowl) {
    const atb = menu.bowls.arma_tu_bowl;
    for (const step of ['step_1_base', 'step_2_proteina']) {
      if (atb[step]?.options) {
        for (const opt of atb[step].options) {
          modifierIndex.set(`bowl:${opt.name.toLowerCase()}`, opt.price);
        }
      }
    }
  }

  if (menu.arma_tu_shawarma) {
    const ats = menu.arma_tu_shawarma;
    if (ats.step_1_proteina?.options) {
      for (const opt of ats.step_1_proteina.options) {
        modifierIndex.set(`shawarma:${opt.name.toLowerCase()}`, opt.price);
      }
    }
  }
}

buildIndices();

export function findItemById(id: string): MenuEntry | undefined {
  return itemIndex.get(id);
}

export function getItemPrice(id: string, variant?: string): number | undefined {
  const item = itemIndex.get(id);
  if (!item) return undefined;

  // Licor: needs trago/botella variant
  if (item.trago !== undefined) {
    if (variant === 'botella') return item.botella;
    return item.trago; // default to trago
  }

  // Item with size variants
  if (item.variants && variant) {
    const v = item.variants.find(
      (v) => v.size.toLowerCase() === variant.toLowerCase()
    );
    if (v) return v.price;
  }

  // If variants exist but no variant specified, return first (larger) price
  if (item.variants && item.variants.length > 0) {
    return item.variants[0].price;
  }

  return item.price;
}

export function getModifierPrice(name: string): number | undefined {
  return modifierIndex.get(name.toLowerCase());
}

export function getAllItemIds(): string[] {
  return Array.from(itemIndex.keys());
}
