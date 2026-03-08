interface MenuEntry {
  id: string
  name: string
  category: string
  price?: number
  variants?: Array<{ size: string; price: number }>
  trago?: number
  botella?: number
}

let itemIndex = new Map<string, MenuEntry>()
let modifierIndex = new Map<string, number>()
let indexBuilt = false

function indexItems(items: any[], category: string): void {
  for (const item of items) {
    if (!item.id) continue
    itemIndex.set(item.id, {
      id: item.id,
      name: item.name,
      category,
      price: item.price,
      variants: item.variants,
    })
  }
}

function indexLicorSubcategory(items: any[], subcategory: string): void {
  items.forEach((item: any, i: number) => {
    const id = `li-${subcategory}-${String(i + 1).padStart(2, '0')}`
    itemIndex.set(id, {
      id,
      name: item.name,
      category: 'licores',
      trago: item.trago,
      botella: item.botella,
    })
  })
}

function indexVinoSubcategory(items: any[], subcategory: string): void {
  items.forEach((item: any, i: number) => {
    const id = `vi-${subcategory}-${String(i + 1).padStart(2, '0')}`
    itemIndex.set(id, {
      id,
      name: item.name,
      category: 'vinos',
      price: item.price,
    })
  })
}

export function buildValidatorIndex(menuData: any): void {
  // Reset indices on each build (for dynamic menu updates)
  itemIndex = new Map()
  modifierIndex = new Map()
  indexBuilt = true

  const menu = menuData.menu ?? menuData

  const standardCategories = [
    'mezzes', 'entradas', 'ensaladas', 'wraps', 'para_compartir',
    'picadas', 'parrilla', 'shawarmas_pan_pita', 'hamburguesas',
    'sides', 'postres', 'te_y_cafe', 'mocktails',
  ]

  for (const key of standardCategories) {
    if (menu[key]?.items) indexItems(menu[key].items, key)
  }

  if (menu.bowls?.predefined) indexItems(menu.bowls.predefined, 'bowls')
  if (menu.crispy_shawarma?.items) indexItems(menu.crispy_shawarma.items, 'crispy_shawarma')

  if (menu.bebidas_frias) {
    for (const sub of ['sodas_de_la_casa', 'limonadas', 'bebidas', 'cervezas']) {
      if (menu.bebidas_frias[sub]) indexItems(menu.bebidas_frias[sub], 'bebidas_frias')
    }
  }

  if (menu.cocktails) {
    for (const sub of ['de_la_casa', 'clasicos']) {
      if (menu.cocktails[sub]) indexItems(menu.cocktails[sub], 'cocktails')
    }
  }

  if (menu.licores) {
    for (const sub of ['whisky', 'gin', 'tequila', 'mezcal', 'vodka', 'ron', 'digestivo']) {
      if (menu.licores[sub]) indexLicorSubcategory(menu.licores[sub], sub)
    }
  }

  if (menu.vinos) {
    for (const sub of ['tinto', 'blanco', 'botella_personal_187ml', 'rosado', 'espumantes', 'sangria']) {
      if (menu.vinos[sub]) indexVinoSubcategory(menu.vinos[sub], sub)
    }
  }

  // Modifiers
  modifierIndex.set('combo papas fritas', 8900)

  if (menu.ensaladas?.adicion_proteina) {
    for (const a of menu.ensaladas.adicion_proteina) {
      modifierIndex.set(a.name.toLowerCase(), a.price)
    }
  }
  if (menu.hamburguesas?.adiciones) {
    for (const a of menu.hamburguesas.adiciones) {
      modifierIndex.set(a.name.toLowerCase(), a.price)
    }
  }
  if (menu.wraps?.toppings) {
    for (const t of menu.wraps.toppings) {
      modifierIndex.set(t.name.toLowerCase(), t.price)
    }
  }
  if (menu.arma_tu_shawarma?.step_3_toppings?.extras) {
    for (const e of menu.arma_tu_shawarma.step_3_toppings.extras) {
      modifierIndex.set(e.name.toLowerCase(), e.price)
    }
  }
  if (menu.bowls?.arma_tu_bowl?.toppings_extra) {
    for (const e of menu.bowls.arma_tu_bowl.toppings_extra) {
      modifierIndex.set(e.name.toLowerCase(), e.price)
    }
  }
  if (menu.bowls?.arma_tu_bowl) {
    for (const step of ['step_1_base', 'step_2_proteina']) {
      for (const opt of menu.bowls.arma_tu_bowl[step]?.options ?? []) {
        modifierIndex.set(`bowl:${opt.name.toLowerCase()}`, opt.price)
      }
    }
  }
  if (menu.arma_tu_shawarma?.step_1_proteina?.options) {
    for (const opt of menu.arma_tu_shawarma.step_1_proteina.options) {
      modifierIndex.set(`shawarma:${opt.name.toLowerCase()}`, opt.price)
    }
  }
}

export function findItemById(id: string): MenuEntry | undefined {
  return itemIndex.get(id)
}

export function getItemPrice(id: string, variant?: string): number | undefined {
  const item = itemIndex.get(id)
  if (!item) return undefined

  if (item.trago !== undefined) {
    return variant === 'botella' ? item.botella : item.trago
  }

  if (item.variants && variant) {
    const v = item.variants.find((v) => v.size.toLowerCase() === variant.toLowerCase())
    if (v) return v.price
  }

  if (item.variants && item.variants.length > 0) {
    return item.variants[0].price
  }

  return item.price
}

export function getModifierPrice(name: string): number | undefined {
  return modifierIndex.get(name.toLowerCase())
}

export function isIndexBuilt(): boolean {
  return indexBuilt
}
