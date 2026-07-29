export type BillingJobName = 'reconcile' | 'cleanup' | 'webhooks' | 'notifications'

export function billingJobUrl(apiInternalUrl: string, jobName: BillingJobName) {
  return `${apiInternalUrl.replace(/\/+$/, '')}/internal/billing/jobs/${jobName}`
}
