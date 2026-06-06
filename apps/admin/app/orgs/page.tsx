import { db, organizations, accounts } from "@planisfy/database"
import { eq, isNull, desc, count, ilike, or, sql } from "drizzle-orm"
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

export default async function OrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const limit = 25
  const offset = (page - 1) * limit
  const search = params.q || ""
  const statusFilter = params.status || ""

  const conditions = []
  if (statusFilter === "deleted") {
    conditions.push(sql`${organizations.deletedAt} IS NOT NULL`)
  } else {
    conditions.push(isNull(organizations.deletedAt))
  }
  if (search) {
    conditions.push(
      or(
        ilike(organizations.name, `%${search}%`),
        ilike(organizations.slug, `%${search}%`)
      )
    )
  }

  const whereClause = conditions.length > 0
    ? sql`${sql.join(conditions, sql` AND `)}`
    : undefined

  const orgList = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      deletedAt: organizations.deletedAt,
      handle: accounts.handle,
      memberCount: sql<number>`(SELECT count(*) FROM members WHERE members.organization_id = ${organizations.id})`.as("member_count"),
      pendingInvites: sql<number>`(SELECT count(*) FROM invitations WHERE invitations.organization_id = ${organizations.id} AND invitations.status = 'pending')`.as("pending_invites"),
    })
    .from(organizations)
    .leftJoin(accounts, eq(organizations.id, accounts.id))
    .where(whereClause)
    .orderBy(desc(organizations.createdAt))
    .limit(limit)
    .offset(offset)

  const [totalRow] = await db
    .select({ count: count() })
    .from(organizations)
    .where(
      statusFilter === "deleted"
        ? sql`${organizations.deletedAt} IS NOT NULL`
        : isNull(organizations.deletedAt)
    )
  const total = totalRow?.count ?? 0

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Organizations</h1>

      <div className="flex gap-3 mb-4">
        <form className="flex gap-2 flex-1">
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by name or slug..."
            className="flex h-8 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Active</option>
            <option value="deleted">Deleted</option>
          </select>
          <button
            type="submit"
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Search
          </button>
        </form>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Handle</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Pending Invites</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orgList.map((org) => (
            <TableRow key={org.id}>
              <TableCell>
                <Link href={`/orgs/${org.id}`} className="font-medium hover:underline">
                  {org.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                {org.slug}
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                @{org.handle}
              </TableCell>
              <TableCell>{org.memberCount}</TableCell>
              <TableCell>
                {org.pendingInvites > 0 ? (
                  <Badge variant="warning">{org.pendingInvites}</Badge>
                ) : (
                  "0"
                )}
              </TableCell>
              <TableCell>
                <Badge variant={org.deletedAt ? "destructive" : "success"}>
                  {org.deletedAt ? "Deleted" : "Active"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {new Date(org.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
          {orgList.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No organizations found
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
                href={`/orgs?page=${page - 1}&q=${search}&status=${statusFilter}`}
                className="h-8 px-3 rounded-md border text-sm flex items-center"
              >
                Previous
              </Link>
            )}
            {offset + limit < total && (
              <Link
                href={`/orgs?page=${page + 1}&q=${search}&status=${statusFilter}`}
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
