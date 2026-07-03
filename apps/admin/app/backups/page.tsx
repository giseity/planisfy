import { desc } from "drizzle-orm"
import { artifactBackups, db } from "@planisfy/database"
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
  createArtifactBackupAction,
  restoreArtifactBackupAction,
} from "@/features/operations/ops-actions"
import { formatBytes, formatDate, shortId, statusBadgeVariant, truncate } from "@/features/operations/ops"

export const dynamic = "force-dynamic"

export default async function BackupsPage() {
  await requireAdmin()
  const backups = await db
    .select()
    .from(artifactBackups)
    .orderBy(desc(artifactBackups.createdAt))
    .limit(100)

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold">Artifact Backups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and restore account-scoped storage object backups.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create backup</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createArtifactBackupAction} className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Storage object ID</span>
              <input
                name="storageObjectId"
                required
                className="flex h-8 w-80 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </label>
            <Button type="submit" size="sm">Create backup</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent backups</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Backup</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => {
                const restorable = backup.status === "completed" || backup.status === "restored"
                return (
                  <TableRow key={backup.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{shortId(backup.id)}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {shortId(backup.accountId)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(backup.status)}>{backup.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="text-sm">{backup.provider}/{backup.bucket}</div>
                      <code className="block truncate text-[11px] text-muted-foreground">
                        {truncate(backup.backupStorageKey, 120)}
                      </code>
                      {backup.errorMessage && (
                        <p className="mt-1 text-xs text-destructive">
                          {truncate(backup.errorMessage, 120)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{formatBytes(backup.size)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(backup.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {restorable && (
                          <form action={restoreArtifactBackupAction}>
                            <input type="hidden" name="id" value={backup.id} />
                            <Button type="submit" size="xs" variant="outline">Restore</Button>
                          </form>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {backups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No backups found.
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
