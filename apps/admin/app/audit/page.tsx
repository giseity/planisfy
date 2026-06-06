import { db, auditEvents, accounts } from "@planisfy/database"
import { eq, desc, count, ilike, sql } from "drizzle-orm"
import { Badge } from "@planisfy/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import Link from "next/link"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; resource?: string; actor?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const limit = 50
  const offset = (page - 1) * limit
  const actionFilter = params.action || ""
  const resourceFilter = params.resource || ""
  const actorFilter = params.actor || ""

  const conditions: ReturnType<typeof sql>[] = []
  if (actionFilter) {
    conditions.push(ilike(auditEvents.action, `%${actionFilter}%`))
  }
  if (resourceFilter) {
    conditions.push(ilike(auditEvents.resourceType, `%${resourceFilter}%`))
  }
  if (actorFilter) {
    conditions.push(ilike(accounts.handle, `%${actorFilter}%`))
  }

  const whereClause = conditions.length > 0
    ? sql`${sql.join(conditions, sql` AND `)}`
    : undefined

  const [events, [totalRow], actionTypes, resourceTypes] = await Promise.all([
    db
      .select({
        id: auditEvents.id,
        profileId: auditEvents.profileId,
        action: auditEvents.action,
        resourceType: auditEvents.resourceType,
        resourceId: auditEvents.resourceId,
        metadata: auditEvents.metadata,
        ipAddress: auditEvents.ipAddress,
        timestamp: auditEvents.timestamp,
        actorHandle: accounts.handle,
        actorDisplayName: accounts.displayName,
      })
      .from(auditEvents)
      .leftJoin(accounts, eq(auditEvents.profileId, accounts.id))
      .where(whereClause)
      .orderBy(desc(auditEvents.timestamp))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(auditEvents)
      .leftJoin(accounts, eq(auditEvents.profileId, accounts.id))
      .where(whereClause),
    db
      .selectDistinct({ action: auditEvents.action })
      .from(auditEvents)
      .orderBy(auditEvents.action),
    db
      .selectDistinct({ resourceType: auditEvents.resourceType })
      .from(auditEvents)
      .orderBy(auditEvents.resourceType),
  ])
  const total = totalRow?.count ?? 0

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      <div className="flex gap-3 mb-4">
        <form className="flex gap-2 flex-1 flex-wrap">
          <input
            name="actor"
            defaultValue={actorFilter}
            placeholder="Filter by actor handle..."
            className="flex h-8 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
          <select
            name="action"
            defaultValue={actionFilter}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All actions</option>
            {actionTypes.map((a) => (
              <option key={a.action} value={a.action}>{a.action}</option>
            ))}
          </select>
          <select
            name="resource"
            defaultValue={resourceFilter}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All resources</option>
            {resourceTypes.map((r) => (
              <option key={r.resourceType} value={r.resourceType}>{r.resourceType}</option>
            ))}
          </select>
          <button
            type="submit"
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Filter
          </button>
        </form>
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        {total.toLocaleString()} event{total !== 1 ? "s" : ""}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Resource ID</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {new Date(event.timestamp).toLocaleString()}
              </TableCell>
              <TableCell>
                {event.actorHandle ? (
                  <Link href={`/users/${event.profileId}`} className="text-sm hover:underline">
                    @{event.actorHandle}
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-xs">System</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">{event.action}</Badge>
              </TableCell>
              <TableCell className="text-sm">{event.resourceType}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {event.resourceId?.slice(0, 16) || "—"}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {event.ipAddress || "—"}
              </TableCell>
            </TableRow>
          ))}
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No audit events found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {total > limit && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </p>
          <div className="flex gap-1">
            {page > 1 && (
              <Link
                href={`/audit?page=${page - 1}&action=${actionFilter}&resource=${resourceFilter}&actor=${actorFilter}`}
                className="h-8 px-3 rounded-md border text-sm flex items-center"
              >
                Previous
              </Link>
            )}
            {offset + limit < total && (
              <Link
                href={`/audit?page=${page + 1}&action=${actionFilter}&resource=${resourceFilter}&actor=${actorFilter}`}
                className="h-8 px-3 rounded-md border text-sm flex items-center"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
