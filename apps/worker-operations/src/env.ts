import { createEnv, z } from '@planisfy/env'

const schema = z.object({
  API_INTERNAL_URL: z.string().url(),
  INTERNAL_API_SECRET: z.string().min(1),
  OPERATIONS_SCHEDULE_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(15_000),
  OPERATIONS_SCHEDULE_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
})

export const env = createEnv(schema, process.env, { appName: 'worker-operations' })
