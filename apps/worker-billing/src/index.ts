import { env } from './env'
import { billingJobUrl, type BillingJobName } from './job-client'

const inFlight = new Map<BillingJobName, Promise<void>>()
let stopping = false
let shutdownPromise: Promise<void> | undefined
const timers = [
  schedule('webhooks', env.BILLING_WEBHOOK_POLL_INTERVAL_MS),
  schedule('reconcile', env.BILLING_RECONCILE_INTERVAL_MS),
  schedule('cleanup', env.BILLING_CLEANUP_INTERVAL_MS),
  schedule('notifications', env.BILLING_NOTIFICATION_INTERVAL_MS),
]

void run('webhooks')
void run('reconcile')
void run('cleanup')
void run('notifications')

function schedule(jobName: BillingJobName, intervalMs: number) {
  return setInterval(() => void run(jobName), intervalMs)
}

function run(jobName: BillingJobName) {
  if (stopping || inFlight.has(jobName)) return
  const job = execute(jobName).finally(() => inFlight.delete(jobName))
  inFlight.set(jobName, job)
  return job
}

async function execute(jobName: BillingJobName) {
  const startedAt = Date.now()
  try {
    const response = await fetch(billingJobUrl(env.API_INTERNAL_URL, jobName), {
      method: 'POST',
      headers: { 'x-internal-secret': env.INTERNAL_API_SECRET },
      signal: AbortSignal.timeout(5 * 60_000),
    })
    if (!response.ok) {
      throw new Error(`Billing ${jobName} job failed with HTTP ${response.status}`)
    }
    const body = await response.json()
    console.info('[worker-billing] job completed', {
      jobName,
      durationMs: Date.now() - startedAt,
      body,
    })
  } catch (error) {
    console.error('[worker-billing] job failed', { jobName, error })
  }
}

function shutdown(signal: string) {
  if (shutdownPromise) return shutdownPromise
  stopping = true
  for (const timer of timers) clearInterval(timer)
  shutdownPromise = (async () => {
    console.info('[worker-billing] shutting down', {
      signal,
      inFlightJobs: [...inFlight.keys()],
    })
    await Promise.allSettled([...inFlight.values()])
    console.info('[worker-billing] shutdown complete')
  })()
  return shutdownPromise
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void shutdown(signal).catch((error) => {
      console.error('[worker-billing] shutdown failed', { signal, error })
      process.exitCode = 1
    })
  })
}
