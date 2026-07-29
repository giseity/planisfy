export function scheduleDispatchUrl(apiInternalUrl: string, batchSize: number) {
  const url = new URL(
    `${apiInternalUrl.replace(/\/+$/, '')}/internal/operations/jobs/schedules`
  )
  url.searchParams.set('limit', String(batchSize))
  return url.toString()
}
