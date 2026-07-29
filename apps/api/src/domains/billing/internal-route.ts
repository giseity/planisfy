import { Hono } from 'hono'
import { z } from 'zod'
import { runBillingJob } from './jobs'

const jobNameSchema = z.enum(['reconcile', 'cleanup', 'webhooks'])

export const billingInternalRoute = new Hono()

billingInternalRoute.post('/internal/billing/jobs/:jobName', async (c) => {
  const jobName = jobNameSchema.parse(c.req.param('jobName'))
  return c.json({ data: await runBillingJob(jobName) })
})
