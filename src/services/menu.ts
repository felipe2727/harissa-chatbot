import { qdrant, C } from '../lib/qdrant'
import rawMenu from '../data/menu.json'

const MENU_POINT_ID = 1
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

let cachedMenu: object | null = null
let cacheExpiry = 0

export async function getMenuData(): Promise<object> {
  if (cachedMenu && Date.now() < cacheExpiry) {
    return cachedMenu
  }

  try {
    const result = await qdrant.retrieve(C.menu, {
      ids: [MENU_POINT_ID],
      with_payload: true,
    })

    if (result.length > 0 && result[0].payload?.data) {
      cachedMenu = result[0].payload.data as object
      cacheExpiry = Date.now() + CACHE_TTL
      return cachedMenu
    }
  } catch {
    console.warn('[menu] Qdrant fetch failed, using local file')
  }

  // Fallback: seed from local file and store in Qdrant
  await seedMenu(rawMenu)
  cachedMenu = rawMenu
  cacheExpiry = Date.now() + CACHE_TTL
  return rawMenu
}

export async function seedMenu(data: object): Promise<void> {
  await qdrant.upsert(C.menu, {
    points: [
      {
        id: MENU_POINT_ID,
        vector: [0.0],
        payload: { data, updated_at: new Date().toISOString() },
      },
    ],
  })
  cachedMenu = data
  cacheExpiry = Date.now() + CACHE_TTL
  console.log('[menu] seeded menu to Qdrant')
}
