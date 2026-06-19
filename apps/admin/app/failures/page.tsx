import Link from "next/link"
import { and, count, desc, eq, lte } from "drizzle-orm"
import { db, eventOutbox, processingJobs } from "@planisfy/database"
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
import { requireAdmin } from "@/features/auth/admin-auth"
import {
  archiveOutboxEventAction,
  cancelProcessingJobAction,
  retryOutboxEventAction,
  retryProcessingJobAction,
} from "@/features/operations/ops-actions"
import {
  formatDate,
  shortId,
  staleJobCutoff,
  staleOutboxCutoff,
  statusBadgeVariant,
  truncate,
} from "@/features/operations/ops"

export const dynamic = "force-dynamic"

export default async function FailuresPage() {
  await requireAdmin()
  const outboxCutoff = staleOutboxCutoff()
  const jobCutoff = staleJobCutoff()

  const [
    failedOutbox,
    staleOutbox,
    failedJobs,
    staleJobs,
    [failedOutboxCount],
    [staleOutboxCount],
    [failedJobCount],
    [staleJobCount],
  ] = await Promise.all([
    db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.status, "FAILED"))
      .orderBy(desc(eventOutbox.updatedAt))
      .limit(50),
    db
      .select()
      .from(eventOutbox)
      .where(and(eq(eventOutbox.status, "PROCESSING"), lte(eventOutbox.updatedAt, outboxCutoff)))
      .orderBy(desc(eventOutbox.updatedAt))
      .limit(50),
    db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.status, "FAILED"))
      .orderBy(desc(processingJobs.updatedAt))
      .limit(50),
    db
      .select()
      .from(processingJobs)
      .where(and(eq(processingJobs.status, "PROCESSING"), lte(processingJobs.updatedAt, jobCutoff)))
      .orderBy(desc(processingJobs.updatedAt))
      .limit(50),
    db.select({ count: count() }).from(eventOutbox).where(eq(eventOutbox.status, "FAILED")),
    db
      .select({ count: count() })
      .from(eventOutbox)
      .where(and(eq(eventOutbox.status, "PROCESSING"), lte(eventOutbox.updatedAt, outboxCutoff))),
    db.select({ count: count() }).from(processingJobs).where(eq(processingJobs.status, "FAILED")),
    db
      .select({ count: count() })
      .from(processingJobs)
      .where(and(eq(processingJobs.status, "PROCESSING"), lte(processingJobs.updatedAt, jobCutoff))),
  ])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Failures</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Failed outbox" value={failedOutboxCount?.count ?? 0} />
        <MetricCard title="Stale outbox" value={staleOutboxCount?.count ?? 0} />
        <MetricCard title="Failed jobs" value={failedJobCount?.count ?? 0} />
        <MetricCard title="Stale jobs" value={staleJobCount?.count ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Outbox Failures</CardTitle>
        </CardHeader>
        <CardContent>
          <OutboxTable events={failedOutbox} stale={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Stale Outbox Processing</CardTitle>
        </CardHeader>
        <CardContent>
          <OutboxTable events={staleOutbox} stale />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Job Failures</CardTitle>
        </CardHeader>
        <CardContent>
          <JobsTable jobs={failedJobs} stale={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Stale Processing Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <JobsTable jobs={staleJobs} stale />
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold">{value.toLocaleString()}</p>
          {value > 0 && <Badge variant="destructive">Needs attention</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}

function OutboxTable({
  events,
  stale,
}: {
  events: Array<typeof eventOutbox.$inferSelect>
  stale: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Attempts</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead>Error</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
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
            <TableCell className="text-xs whitespace-nowrap">{formatDate(event.updatedAt)}</TableCell>
            <TableCell className="max-w-md text-xs text-destructive">
              {truncate(event.lastError, 140)}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <form action={retryOutboxEventAction}>
                  <input type="hidden" name="id" value={event.id} />
                  <Button size="xs" variant="outline" type="submit">Retry</Button>
                </form>
                <form action={archiveOutboxEventAction}>
                  <input type="hidden" name="id" value={event.id} />
                  <Button size="xs" variant="ghost" type="submit">Archive</Button>
                </form>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {events.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
              None found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

function JobsTable({
  jobs,
  stale,
}: {
  jobs: Array<typeof processingJobs.$inferSelect>
  stale: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead>Error</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell>
              <Link href={`/jobs/${job.id}`} className="font-medium text-sm hover:underline">
                {job.type}
              </Link>
              <div className="font-mono text-xs text-muted-foreground">{shortId(job.id)}</div>
            </TableCell>
            <TableCell>
              <div className="flex gap-2 flex-wrap">
                <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
                {stale && <Badge variant="warning">STALE</Badge>}
              </div>
            </TableCell>
            <TableCell className="font-mono text-sm">{job.progress}%</TableCell>
            <TableCell className="text-xs whitespace-nowrap">{formatDate(job.updatedAt)}</TableCell>
            <TableCell className="max-w-md text-xs text-destructive">
              {truncate(job.errorMessage, 140)}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                {!stale && (
                  <form action={retryProcessingJobAction}>
                    <input type="hidden" name="id" value={job.id} />
                    <Button size="xs" variant="outline" type="submit">Retry</Button>
                  </form>
                )}
                {stale && (
                  <form action={cancelProcessingJobAction}>
                    <input type="hidden" name="id" value={job.id} />
                    <Button size="xs" variant="ghost" type="submit">Cancel</Button>
                  </form>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
        {jobs.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
              None found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
