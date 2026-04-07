import { QdrantClient } from '@qdrant/js-client-rest'
import { logger } from './logger'

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
})

// Production uses harissa_*, dev/test use dev_harissa_* / test_harissa_*
const ENV_PREFIX = process.env.NODE_ENV === 'production' ? '' : `${process.env.NODE_ENV ?? 'dev'}_`

export const C = {
  menu: `${ENV_PREFIX}harissa_menu`,
  sessions: `${ENV_PREFIX}harissa_sessions`,
  orders: `${ENV_PREFIX}harissa_orders`,
  reservations: `${ENV_PREFIX}harissa_reservations`,
}

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
      logger.info('qdrant', `Created collection: ${name}`)
    }
  }
}
