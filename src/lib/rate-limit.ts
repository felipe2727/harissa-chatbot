const WINDOW_MS = 60_000       // 1-minute window
const MAX_REQUESTS = 15        // 15 requests per minute per session
const CLEANUP_INTERVAL = 300_000 // Purge stale entries every 5 min

const store = new Map<string, number[]>()
let lastCleanup = Date.now()

function cleanup(): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  const cutoff = now - WINDOW_MS
  for (const [key, timestamps] of store) {
    const fresh = timestamps.filter(t => t > cutoff)
    if (fresh.length === 0) store.delete(key)
    else store.set(key, fresh)
  }
}

export function checkRateLimit(sessionId: string): { allowed: boolean; retryAfterMs?: number } {
  cleanup()
  const now = Date.now()
  const cutoff = now - WINDOW_MS

  let timestamps = store.get(sessionId)
  if (!timestamps) {
    timestamps = []
    store.set(sessionId, timestamps)
  }

  // Slide the window
  const fresh = timestamps.filter(t => t > cutoff)
  store.set(sessionId, fresh)

  if (fresh.length >= MAX_REQUESTS) {
    const retryAfterMs = WINDOW_MS - (now - fresh[0])
    return { allowed: false, retryAfterMs }
  }

  fresh.push(now)
  return { allowed: true }
}
