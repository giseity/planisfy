import { env } from './env'
import { scheduleDispatchUrl } from './job-client'

let inFlight: Promise<void> | undefined
let stopping = false
let shutdownPromise: Promise<void> | undefined
const timer = setInterval(() => void run(), env.OPERATIONS_SCHEDULE_POLL_INTERVAL_MS)

void run()

function run() {
  if (stopping || inFlight) return inFlight
  inFlight = execute().finally(() => {
    inFlight = undefined
  })
  return inFlight
}

async function execute() {
  const startedAt = Date.now()
  try {
    const response = await fetch(
      scheduleDispatchUrl(env.API_INTERNAL_URL, env.OPERATIONS_SCHEDULE_BATCH_SIZE),
      {
        method: 'POST',
        headers: { 'x-internal-secret': env.INTERNAL_API_SECRET },
        signal: AbortSignal.timeout(5 * 60_000),
      }
    )
    if (!response.ok) {
      throw new Error(`Schedule dispatch failed with HTTP ${response.status}`)
    }
    console.info('[worker-operations] dispatch completed', {
      durationMs: Date.now() - startedAt,
      body: await response.json(),
    })
  } catch (error) {
    console.error('[worker-operations] dispatch failed', { error })
  }
}

function shutdown(signal: string) {
  if (shutdownPromise) return shutdownPromise
  stopping = true
  clearInterval(timer)
  shutdownPromise = (async () => {
    console.info('[worker-operations] shutting down', { signal, inFlight: Boolean(inFlight) })
    if (inFlight) await Promise.allSettled([inFlight])
    console.info('[worker-operations] shutdown complete')
  })()
  return shutdownPromise
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void shutdown(signal).catch((error) => {
      console.error('[worker-operations] shutdown failed', { signal, error })
      process.exitCode = 1
    })
  })
}
