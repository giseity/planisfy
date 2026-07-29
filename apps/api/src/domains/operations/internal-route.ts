import { Hono } from 'hono'
import { z } from 'zod'
import { dispatchDueScheduledOperations } from './route'

const dispatchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const operationsInternalRoute = new Hono()

operationsInternalRoute.post('/internal/operations/jobs/schedules', async (c) => {
  const parsed = dispatchSchema.parse({ limit: c.req.query('limit') })
  return c.json({
    data: await dispatchDueScheduledOperations({ limit: parsed.limit }),
  })
})
