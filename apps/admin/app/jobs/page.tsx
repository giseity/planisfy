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
import { db, processingJobs } from "@planisfy/database"
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
  jobStatuses,
  makePaginationHref,
  OPS_PAGE_SIZE,
  parsePositiveInt,
  shortId,
  staleJobCutoff,
  statusBadgeVariant,
  truncate,
} from "@/lib/ops"

type SearchParams = {
  page?: string
  status?: string
  type?: string
  account?: string
  q?: string
  state?: string
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAdmin()
  const params = await searchParams
  const page = parsePositiveInt(params.page)
  const offset = (page - 1) * OPS_PAGE_SIZE
  const statusFilter = jobStatuses.find((status) => status === params.status)
  const typeFilter = params.type ?? ""
  const accountFilter = params.account ?? ""
  const q = params.q ?? ""
  const stateFilter = params.state ?? ""
  const staleCutoff = staleJobCutoff()

  const conditions: SQL[] = []
  if (statusFilter) conditions.push(eq(processingJobs.status, statusFilter))
  if (typeFilter) conditions.push(eq(processingJobs.type, typeFilter))
  if (accountFilter) conditions.push(eq(processingJobs.accountId, accountFilter))
  if (q) {
    conditions.push(
      sql`(${processingJobs.id}::text ILIKE ${`%${q}%`} OR ${processingJobs.errorMessage} ILIKE ${`%${q}%`} OR ${processingJobs.input}::text ILIKE ${`%${q}%`} OR ${processingJobs.output}::text ILIKE ${`%${q}%`})`,
    )
  }
  if (stateFilter === "stale") {
    conditions.push(
      and(eq(processingJobs.status, "PROCESSING"), lte(processingJobs.updatedAt, staleCutoff))!,
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [[totalRow], jobs, types, [failedRow], [staleRow], [processingRow]] =
    await Promise.all([
      db.select({ count: count() }).from(processingJobs).where(whereClause),
      db
        .select()
        .from(processingJobs)
        .where(whereClause)
        .orderBy(desc(processingJobs.updatedAt))
        .limit(OPS_PAGE_SIZE)
        .offset(offset),
      db
        .selectDistinct({ type: processingJobs.type })
        .from(processingJobs)
        .orderBy(processingJobs.type),
      db
        .select({ count: count() })
        .from(processingJobs)
        .where(eq(processingJobs.status, "FAILED")),
      db
        .select({ count: count() })
        .from(processingJobs)
        .where(and(eq(processingJobs.status, "PROCESSING"), lte(processingJobs.updatedAt, staleCutoff))),
      db
        .select({ count: count() })
        .from(processingJobs)
        .where(eq(processingJobs.status, "PROCESSING")),
    ])
  const total = totalRow?.count ?? 0

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Processing Jobs</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard title="Failed" value={failedRow?.count ?? 0} tone="destructive" />
        <MetricCard title="Stale processing" value={staleRow?.count ?? 0} tone="warning" />
        <MetricCard title="Processing" value={processingRow?.count ?? 0} tone="secondary" />
      </div>

      <form className="flex gap-2 flex-wrap mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search id, input, output, error..."
          className="flex h-8 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm"
        />
        <input
          name="account"
          defaultValue={accountFilter}
          placeholder="Account id..."
          className="flex h-8 w-56 rounded-md border border-input bg-background px-3 py-1 text-sm"
        />
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All statuses</option>
          {jobStatuses.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={typeFilter}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All types</option>
          {types.map((type) => (
            <option key={type.type} value={type.type}>{type.type}</option>
          ))}
        </select>
        <select
          name="state"
          defaultValue={stateFilter}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Any state</option>
          <option value="stale">Stale processing</option>
        </select>
        <Button type="submit" size="sm">Filter</Button>
      </form>

      <p className="text-sm text-muted-foreground mb-3">
        {total.toLocaleString()} job{total !== 1 ? "s" : ""}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Retries</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Error</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const stale = isStaleProcessing(job.status, job.updatedAt, staleCutoff)
            const canRetry = job.status === "FAILED" || job.status === "CANCELED"
            const canCancel = job.status === "PENDING" || job.status === "PROCESSING"
            return (
              <TableRow key={job.id}>
                <TableCell>
                  <Link href={`/jobs/${job.id}`} className="font-medium text-sm hover:underline">
                    {job.type}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{shortId(job.id)}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{shortId(job.accountId)}</div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
                    {stale && <Badge variant="warning">STALE</Badge>}
                    {job.cancelRequestedAt && <Badge variant="secondary">CANCEL REQUESTED</Badge>}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">{job.progress}%</TableCell>
                <TableCell className="font-mono text-sm">{job.retryCount}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDate(job.updatedAt)}</TableCell>
                <TableCell className="max-w-md text-xs text-destructive">
                  {truncate(job.errorMessage, 140)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {canRetry && (
                      <form action={retryProcessingJobAction}>
                        <input type="hidden" name="id" value={job.id} />
                        <Button size="xs" variant="outline" type="submit">Retry</Button>
                      </form>
                    )}
                    {canCancel && (
                      <form action={cancelProcessingJobAction}>
                        <input type="hidden" name="id" value={job.id} />
                        <Button size="xs" variant="ghost" type="submit">Cancel</Button>
                      </form>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {jobs.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No processing jobs found
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
                <Link href={makePaginationHref("/jobs", params, page - 1)}>Previous</Link>
              </Button>
            )}
            {offset + OPS_PAGE_SIZE < total && (
              <Button asChild variant="outline" size="sm">
                <Link href={makePaginationHref("/jobs", params, page + 1)}>Next</Link>
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
          {value > 0 && <Badge variant={tone}>Visible</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}
