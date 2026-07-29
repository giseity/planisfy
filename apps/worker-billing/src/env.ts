import { createEnv, z } from '@planisfy/env'

const schema = z.object({
  API_INTERNAL_URL: z.string().url(),
  INTERNAL_API_SECRET: z.string().min(1),
  BILLING_WEBHOOK_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
  BILLING_RECONCILE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .default(60 * 60_000),
  BILLING_CLEANUP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .default(24 * 60 * 60_000),
})

export const env = createEnv(schema, process.env, { appName: 'worker-billing' })
