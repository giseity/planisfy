import Link from "next/link"
import {
  and,
  count,
  desc,
  eq,
  lte,
  sql,
  type SQL,
} from "drizzle-orm"
import { db, eventOutbox } from "@planisfy/database"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import { requireAdmin } from "@/lib/admin-auth"
import {
  archiveOutboxEventAction,
  retryOutboxEventAction,
} from "@/lib/ops-actions"
import {
  formatDate,
  isStaleProcessing,
  makePaginationHref,
  OPS_PAGE_SIZE,
  outboxStatuses,
  parsePositiveInt,
  shortId,
  staleOutboxCutoff,
  statusBadgeVariant,
  truncate,
} from "@/lib/ops"

export const dynamic = "force-dynamic"

type SearchParams = {
  page?: string
  status?: string
  event?: string
  q?: string
  state?: string
}

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAdmin()
  const params = await searchParams
  const page = parsePositiveInt(params.page)
  const offset = (page - 1) * OPS_PAGE_SIZE
  const statusFilter = outboxStatuses.find((status) => status === params.status)
  const eventFilter = params.event ?? ""
  const q = params.q ?? ""
  const stateFilter = params.state ?? ""
  const now = new Date()
  const staleCutoff = staleOutboxCutoff(now)

  const conditions: SQL[] = []
  if (statusFilter) conditions.push(eq(eventOutbox.status, statusFilter))
  if (eventFilter) conditions.push(eq(eventOutbox.eventName, eventFilter))
  if (q) {
    conditions.push(
      sql`(${eventOutbox.id}::text ILIKE ${`%${q}%`} OR ${eventOutbox.lastError} ILIKE ${`%${q}%`} OR ${eventOutbox.payload}::text ILIKE ${`%${q}%`})`,
    )
  }
  if (stateFilter === "due") {
    conditions.push(and(eq(eventOutbox.status, "PENDING"), lte(eventOutbox.processAt, now))!)
  }
  if (stateFilter === "stale") {
    conditions.push(
      and(eq(eventOutbox.status, "PROCESSING"), lte(eventOutbox.updatedAt, staleCutoff))!,
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [
    events,
    [totalRow],
    eventNames,
    [failedRow],
    [staleRow],
    [dueRow],
  ] = await Promise.all([
    db
      .select()
      .from(eventOutbox)
      .where(whereClause)
      .orderBy(desc(eventOutbox.updatedAt))
      .limit(OPS_PAGE_SIZE)
      .offset(offset),
    db.select({ count: count() }).from(eventOutbox).where(whereClause),
    db
      .selectDistinct({ eventName: eventOutbox.eventName })
      .from(eventOutbox)
      .orderBy(eventOutbox.eventName),
    db
      .select({ count: count() })
      .from(eventOutbox)
      .where(eq(eventOutbox.status, "FAILED")),
    db
      .select({ count: count() })
      .from(eventOutbox)
      .where(and(eq(eventOutbox.status, "PROCESSING"), lte(eventOutbox.updatedAt, staleCutoff))),
    db
      .select({ count: count() })
      .from(eventOutbox)
      .where(and(eq(eventOutbox.status, "PENDING"), lte(eventOutbox.processAt, now))),
  ])
  const total = totalRow?.count ?? 0

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Outbox</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard title="Failed" value={failedRow?.count ?? 0} tone="destructive" />
        <MetricCard title="Stale processing" value={staleRow?.count ?? 0} tone="warning" />
        <MetricCard title="Due pending" value={dueRow?.count ?? 0} tone="secondary" />
      </div>

      <form className="flex gap-2 flex-wrap mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search id, payload, error..."
          className="flex h-8 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm"
        />
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All statuses</option>
          {outboxStatuses.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <select
          name="event"
          defaultValue={eventFilter}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All events</option>
          {eventNames.map((event) => (
            <option key={event.eventName} value={event.eventName}>{event.eventName}</option>
          ))}
        </select>
        <select
          name="state"
          defaultValue={stateFilter}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Any state</option>
          <option value="due">Due pending</option>
          <option value="stale">Stale processing</option>
        </select>
        <Button type="submit" size="sm">Filter</Button>
      </form>

      <p className="text-sm text-muted-foreground mb-3">
        {total.toLocaleString()} event{total !== 1 ? "s" : ""}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Process At</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Error / Payload</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => {
            const stale = isStaleProcessing(event.status, event.updatedAt, staleCutoff)
            const canRetry = event.status === "FAILED" || stale
            const canArchive = event.status !== "ARCHIVED" && (event.status !== "PROCESSING" || stale)
            return (
              <TableRow key={event.id}>
                <TableCell>
                  <div className="font-medium text-sm">{event.eventName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{shortId(event.id)}</div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant={statusBadgeVariant(event.status)}>{event.status}</Badge>
                    {stale && <Badge variant="warning">STALE</Badge>}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">{event.attempts}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDate(event.processAt)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDate(event.updatedAt)}</TableCell>
                <TableCell className="max-w-md">
                  <div className="text-xs text-destructive">{truncate(event.lastError, 120)}</div>
                  <code className="block text-[11px] text-muted-foreground truncate">
                    {truncate(JSON.stringify(event.payload), 140)}
                  </code>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {canRetry && (
                      <form action={retryOutboxEventAction}>
                        <input type="hidden" name="id" value={event.id} />
                        <Button size="xs" variant="outline" type="submit">Retry</Button>
                      </form>
                    )}
                    {canArchive && (
                      <form action={archiveOutboxEventAction}>
                        <input type="hidden" name="id" value={event.id} />
                        <Button size="xs" variant="ghost" type="submit">Archive</Button>
                      </form>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No outbox events found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {total > OPS_PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + OPS_PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-1">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={makePaginationHref("/outbox", params, page - 1)}>Previous</Link>
              </Button>
            )}
            {offset + OPS_PAGE_SIZE < total && (
              <Button asChild variant="outline" size="sm">
                <Link href={makePaginationHref("/outbox", params, page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string
  value: number
  tone: "destructive" | "warning" | "secondary"
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold">{value.toLocaleString()}</p>
          {value > 0 && <Badge variant={tone}>Needs attention</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}
