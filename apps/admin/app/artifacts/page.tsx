import Link from "next/link"
import {
  and,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm"
import { db, storageObjects } from "@planisfy/database"
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
  restoreArtifactAction,
  softDeleteArtifactAction,
} from "@/features/operations/ops-actions"
import {
  formatBytes,
  formatDate,
  makePaginationHref,
  OPS_PAGE_SIZE,
  parsePositiveInt,
  shortId,
  truncate,
} from "@/features/operations/ops"

export const dynamic = "force-dynamic"

type SearchParams = {
  page?: string
  q?: string
  account?: string
  provider?: string
  resourceType?: string
  artifactKind?: string
  deleted?: string
}

export default async function ArtifactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAdmin()
  const params = await searchParams
  const page = parsePositiveInt(params.page)
  const offset = (page - 1) * OPS_PAGE_SIZE
  const q = params.q ?? ""
  const accountFilter = params.account ?? ""
  const providerFilter = params.provider ?? ""
  const resourceTypeFilter = params.resourceType ?? ""
  const artifactKindFilter = params.artifactKind ?? ""
  const deletedFilter = params.deleted ?? "active"

  const conditions: SQL[] = []
  if (q) {
    conditions.push(
      sql`(${storageObjects.id}::text ILIKE ${`%${q}%`} OR ${storageObjects.storageKey} ILIKE ${`%${q}%`} OR ${storageObjects.fileName} ILIKE ${`%${q}%`} OR ${storageObjects.resourceId}::text ILIKE ${`%${q}%`})`,
    )
  }
  if (accountFilter) conditions.push(eq(storageObjects.accountId, accountFilter))
  if (providerFilter) conditions.push(eq(storageObjects.provider, providerFilter))
  if (resourceTypeFilter) conditions.push(eq(storageObjects.resourceType, resourceTypeFilter))
  if (artifactKindFilter) conditions.push(eq(storageObjects.artifactKind, artifactKindFilter))
  if (deletedFilter === "active") conditions.push(isNull(storageObjects.deletedAt))
  if (deletedFilter === "deleted") conditions.push(isNotNull(storageObjects.deletedAt))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [
    artifacts,
    [totalRow],
    providers,
    resourceTypes,
    artifactKinds,
    [activeRow],
    [deletedRow],
  ] = await Promise.all([
    db
      .select()
      .from(storageObjects)
      .where(whereClause)
      .orderBy(desc(storageObjects.updatedAt))
      .limit(OPS_PAGE_SIZE)
      .offset(offset),
    db.select({ count: count() }).from(storageObjects).where(whereClause),
    db
      .selectDistinct({ provider: storageObjects.provider })
      .from(storageObjects)
      .orderBy(storageObjects.provider),
    db
      .selectDistinct({ resourceType: storageObjects.resourceType })
      .from(storageObjects)
      .where(isNotNull(storageObjects.resourceType))
      .orderBy(storageObjects.resourceType),
    db
      .selectDistinct({ artifactKind: storageObjects.artifactKind })
      .from(storageObjects)
      .where(isNotNull(storageObjects.artifactKind))
      .orderBy(storageObjects.artifactKind),
    db
      .select({ count: count() })
      .from(storageObjects)
      .where(isNull(storageObjects.deletedAt)),
    db
      .select({ count: count() })
      .from(storageObjects)
      .where(isNotNull(storageObjects.deletedAt)),
  ])
  const total = totalRow?.count ?? 0

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Artifacts</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <MetricCard title="Active artifacts" value={activeRow?.count ?? 0} />
        <MetricCard title="Soft deleted" value={deletedRow?.count ?? 0} />
      </div>

      <form className="flex gap-2 flex-wrap mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search id, key, file, resource..."
          className="flex h-8 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm"
        />
        <input
          name="account"
          defaultValue={accountFilter}
          placeholder="Account id..."
          className="flex h-8 w-56 rounded-md border border-input bg-background px-3 py-1 text-sm"
        />
        <select
          name="provider"
          defaultValue={providerFilter}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All providers</option>
          {providers.map((provider) => (
            <option key={provider.provider} value={provider.provider}>{provider.provider}</option>
          ))}
        </select>
        <select
          name="resourceType"
          defaultValue={resourceTypeFilter}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All resources</option>
          {resourceTypes.map((resource) => (
            <option key={resource.resourceType} value={resource.resourceType ?? ""}>
              {resource.resourceType}
            </option>
          ))}
        </select>
        <select
          name="artifactKind"
          defaultValue={artifactKindFilter}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All artifact kinds</option>
          {artifactKinds.map((artifact) => (
            <option key={artifact.artifactKind} value={artifact.artifactKind ?? ""}>
              {artifact.artifactKind}
            </option>
          ))}
        </select>
        <select
          name="deleted"
          defaultValue={deletedFilter}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="active">Active</option>
          <option value="deleted">Deleted</option>
          <option value="all">All states</option>
        </select>
        <Button type="submit" size="sm">Filter</Button>
      </form>

      <p className="text-sm text-muted-foreground mb-3">
        {total.toLocaleString()} artifact{total !== 1 ? "s" : ""}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Artifact</TableHead>
            <TableHead>Storage</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {artifacts.map((artifact) => (
            <TableRow key={artifact.id}>
              <TableCell>
                <div className="font-medium text-sm">{artifact.fileName ?? "Artifact"}</div>
                <div className="font-mono text-xs text-muted-foreground">{shortId(artifact.id)}</div>
                {artifact.deletedAt && <Badge variant="secondary">DELETED</Badge>}
              </TableCell>
              <TableCell className="max-w-md">
                <div className="text-sm">{artifact.provider}/{artifact.bucket}</div>
                <code className="block text-[11px] text-muted-foreground truncate">
                  {truncate(artifact.storageKey, 120)}
                </code>
              </TableCell>
              <TableCell>
                <div className="text-sm">{artifact.resourceType ?? "-"}</div>
                <div className="font-mono text-xs text-muted-foreground">{shortId(artifact.resourceId)}</div>
                {artifact.resourceType === "tileset" && artifact.resourceId && (
                  <Link href={`/jobs?account=${artifact.accountId ?? ""}&q=${artifact.resourceId}`} className="text-xs hover:underline">
                    Related jobs
                  </Link>
                )}
              </TableCell>
              <TableCell>
                <div className="text-sm">{artifact.artifactKind ?? "-"}</div>
                <div className="text-xs text-muted-foreground">{artifact.version ?? "-"}</div>
              </TableCell>
              <TableCell className="font-mono text-sm">{formatBytes(artifact.size)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{formatDate(artifact.updatedAt)}</TableCell>
              <TableCell>
                <div className="flex justify-end">
                  {artifact.deletedAt ? (
                    <form action={restoreArtifactAction}>
                      <input type="hidden" name="id" value={artifact.id} />
                      <Button size="xs" variant="outline" type="submit">Restore</Button>
                    </form>
                  ) : (
                    <form action={softDeleteArtifactAction}>
                      <input type="hidden" name="id" value={artifact.id} />
                      <Button size="xs" variant="ghost" type="submit">Soft delete</Button>
                    </form>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {artifacts.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No artifacts found
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
                <Link href={makePaginationHref("/artifacts", params, page - 1)}>Previous</Link>
              </Button>
            )}
            {offset + OPS_PAGE_SIZE < total && (
              <Button asChild variant="outline" size="sm">
                <Link href={makePaginationHref("/artifacts", params, page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
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
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  )
}
