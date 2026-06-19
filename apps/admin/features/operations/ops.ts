import { eventOutbox, processingJobs } from "@planisfy/database"

export const OUTBOX_STALE_MS = 15 * 60 * 1000
export const JOB_STALE_MS = 60 * 60 * 1000
export const OPS_PAGE_SIZE = 50

export const outboxStatuses = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "ARCHIVED",
] as const

export const jobStatuses = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
] as const

export type OutboxStatus = typeof eventOutbox.$inferSelect.status
export type JobStatus = typeof processingJobs.$inferSelect.status

export function staleOutboxCutoff(now = new Date()) {
  return new Date(now.getTime() - OUTBOX_STALE_MS)
}

export function staleJobCutoff(now = new Date()) {
  return new Date(now.getTime() - JOB_STALE_MS)
}

export function isStaleProcessing(
  status: "PROCESSING" | string,
  updatedAt: Date,
  cutoff: Date,
) {
  return status === "PROCESSING" && updatedAt <= cutoff
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-"
  return new Date(value).toLocaleString()
}

export function formatBytes(value: number | null | undefined) {
  if (value == null) return "-"
  if (value < 1024) return `${value} B`
  const units = ["KB", "MB", "GB", "TB"]
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`
}

export function shortId(id: string | null | undefined) {
  return id ? id.slice(0, 8) : "-"
}

export function stringifyJson(value: unknown) {
  if (value == null) return "-"
  return JSON.stringify(value, null, 2)
}

export function truncate(value: string | null | undefined, length = 120) {
  if (!value) return "-"
  return value.length > length ? `${value.slice(0, length - 1)}...` : value
}

export function parsePositiveInt(value: string | undefined, fallback = 1) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export function makePaginationHref(
  path: string,
  params: Record<string, string | undefined>,
  page: number,
) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  search.set("page", String(page))
  return `${path}?${search.toString()}`
}

export function statusBadgeVariant(status: string) {
  if (status === "FAILED") return "destructive"
  if (status === "PROCESSING") return "warning"
  if (status === "SUCCEEDED" || status === "COMPLETED") return "success"
  if (status === "CANCELED" || status === "ARCHIVED") return "secondary"
  return "outline"
}
