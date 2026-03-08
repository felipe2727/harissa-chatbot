import { QdrantClient } from '@qdrant/js-client-rest'

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
})

export const C = {
  menu: 'harissa_menu',
  sessions: 'harissa_sessions',
  orders: 'harissa_orders',
  reservations: 'harissa_reservations',
} as const

const COLLECTIONS = Object.values(C)
const VECTOR_CONFIG = { size: 1, distance: 'Cosine' as const }

let bootstrapped = false

export async function bootstrapCollections(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true

  const existing = await qdrant.getCollections()
  const names = new Set(existing.collections.map((c) => c.name))

  for (const name of COLLECTIONS) {
    if (!names.has(name)) {
      await qdrant.createCollection(name, { vectors: VECTOR_CONFIG })
      console.log(`[qdrant] created collection: ${name}`)
    }
  }
}
