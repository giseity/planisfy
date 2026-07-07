import { adminMetadata } from "../../lib/metadata";

export const metadata = adminMetadata({
  title: "API Keys",
  description: "Audit API key ownership, scopes, and platform access.",
  path: "/keys",
});

import { db, apiKeys, accounts } from "@planisfy/database"
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
import { requireAdmin } from "@/features/auth/admin-auth"

export const dynamic = "force-dynamic"

export default async function KeysPage({
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

  const now = new Date()
  const conditions: ReturnType<typeof sql>[] = []

  switch (statusFilter) {
    case "expired":
      conditions.push(sql`${apiKeys.expiresAt} IS NOT NULL AND ${apiKeys.expiresAt} < ${now}`)
      conditions.push(eq(apiKeys.enabled, true))
      break
    case "revoked":
      conditions.push(eq(apiKeys.enabled, false))
      break
    default:
      conditions.push(eq(apiKeys.enabled, true))
      break
  }

  if (search) {
    conditions.push(
      sql`(${ilike(apiKeys.name, `%${search}%`)} OR ${ilike(apiKeys.id, `%${search}%`)} OR ${ilike(accounts.handle, `%${search}%`)})`
    )
  }

  const whereClause = conditions.length > 0
    ? sql`${sql.join(conditions, sql` AND `)}`
    : undefined

  const keyList = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      ownerId: apiKeys.referenceId,
      permissions: apiKeys.permissions,
      metadata: apiKeys.metadata,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastRequest,
      createdAt: apiKeys.createdAt,
      enabled: apiKeys.enabled,
      ownerHandle: accounts.handle,
      ownerDisplayName: accounts.displayName,
    })
    .from(apiKeys)
    .leftJoin(accounts, eq(apiKeys.referenceId, accounts.id))
    .where(whereClause)
    .orderBy(desc(apiKeys.createdAt))
    .limit(limit)
    .offset(offset)

  const [totalRow] = await db
    .select({ count: count() })
    .from(apiKeys)
    .leftJoin(accounts, eq(apiKeys.referenceId, accounts.id))
    .where(whereClause)
  const total = totalRow?.count ?? 0

  function getKeyStatus(key: { expiresAt: Date | null; enabled: boolean }) {
    if (!key.enabled) return { label: "Revoked", variant: "destructive" as const }
    if (key.expiresAt && new Date(key.expiresAt) < now) return { label: "Expired", variant: "warning" as const }
    return { label: "Active", variant: "success" as const }
  }

  function keyScopes(permissions: string | null) {
    if (!permissions) return []
    try {
      const parsed = JSON.parse(permissions) as { scopes?: unknown }
      return Array.isArray(parsed.scopes) ? parsed.scopes.filter((scope): scope is string => typeof scope === "string") : []
    } catch {
      return []
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">API Keys</h1>

      <div className="flex gap-3 mb-4">
        <form className="flex gap-2 flex-1">
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by name, key ID, or owner..."
            className="flex h-8 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
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
            <TableHead>Key ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Scopes</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keyList.map((key) => {
            const status = getKeyStatus(key)
            const scopes = keyScopes(key.permissions)
            return (
              <TableRow key={key.id}>
                <TableCell className="font-mono text-xs">{key.id.slice(0, 16)}...</TableCell>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell>
                  <Link href={`/users/${key.ownerId}`} className="text-sm hover:underline">
                    @{key.ownerHandle}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {scopes.slice(0, 3).map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                    ))}
                    {scopes.length > 3 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{scopes.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(key.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            )
          })}
          {keyList.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No API keys found
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
                href={`/keys?page=${page - 1}&q=${search}&status=${statusFilter}`}
                className="h-8 px-3 rounded-md border text-sm flex items-center"
              >
                Previous
              </Link>
            )}
            {offset + limit < total && (
              <Link
                href={`/keys?page=${page + 1}&q=${search}&status=${statusFilter}`}
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
