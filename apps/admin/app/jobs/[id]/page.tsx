import Link from "next/link"
import { desc, eq, sql } from "drizzle-orm"
import { notFound } from "next/navigation"
import { db, eventOutbox, processingJobLogs, processingJobs } from "@planisfy/database"
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
  cancelProcessingJobAction,
  retryProcessingJobAction,
} from "@/lib/ops-actions"
import {
  formatDate,
  isStaleProcessing,
  shortId,
  staleJobCutoff,
  statusBadgeVariant,
  stringifyJson,
  truncate,
} from "@/lib/ops"

export const dynamic = "force-dynamic"

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, id))
    .limit(1)

  if (!job) notFound()

  const [logs, relatedOutbox] = await Promise.all([
    db
      .select()
      .from(processingJobLogs)
      .where(eq(processingJobLogs.jobId, id))
      .orderBy(desc(processingJobLogs.createdAt))
      .limit(100),
    db
      .select()
      .from(eventOutbox)
      .where(sql`${eventOutbox.payload}->>'jobId' = ${id}`)
      .orderBy(desc(eventOutbox.createdAt))
      .limit(50),
  ])

  const stale = isStaleProcessing(job.status, job.updatedAt, staleJobCutoff())
  const canRetry = job.status === "FAILED" || job.status === "CANCELED"
  const canCancel = job.status === "PENDING" || job.status === "PROCESSING"

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
            Back to jobs
          </Link>
          <h1 className="text-2xl font-bold mt-2">{job.type}</h1>
          <p className="font-mono text-xs text-muted-foreground">{job.id}</p>
        </div>
        <div className="flex gap-2">
          {canRetry && (
            <form action={retryProcessingJobAction}>
              <input type="hidden" name="id" value={job.id} />
              <Button type="submit" variant="outline">Retry</Button>
            </form>
          )}
          {canCancel && (
            <form action={cancelProcessingJobAction}>
              <input type="hidden" name="id" value={job.id} />
              <Button type="submit" variant="ghost">Cancel</Button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
            {stale && <Badge variant="warning">STALE</Badge>}
            {job.cancelRequestedAt && <Badge variant="secondary">CANCEL REQUESTED</Badge>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{job.progress}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Retries</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{job.retryCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Updated</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{formatDate(job.updatedAt)}</p>
          </CardContent>
        </Card>
      </div>

      {job.errorMessage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Failure</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{job.errorMessage}</p>
            {job.errorCode && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">{job.errorCode}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <JsonCard title="Input" value={job.input} />
        <JsonCard title="Output" value={job.output} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Related Outbox Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relatedOutbox.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <div className="text-sm">{event.eventName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{shortId(event.id)}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(event.status)}>{event.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{event.attempts}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(event.updatedAt)}</TableCell>
                  <TableCell className="text-xs text-destructive">{truncate(event.lastError, 120)}</TableCell>
                </TableRow>
              ))}
              {relatedOutbox.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No related outbox events found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={log.level === "error" ? "destructive" : log.level === "warn" ? "warning" : "outline"}>
                      {log.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{log.message}</TableCell>
                  <TableCell>
                    <code className="block max-w-md truncate text-[11px] text-muted-foreground">
                      {truncate(JSON.stringify(log.metadata), 180)}
                    </code>
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No job logs found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
          {stringifyJson(value)}
        </pre>
      </CardContent>
    </Card>
  )
}
