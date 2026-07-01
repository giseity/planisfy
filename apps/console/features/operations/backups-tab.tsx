'use client'

import { useMemo, useState } from 'react'
import { api, type ConsoleArtifactBackup } from '@/lib/api'
import { formatBytes, formatDate } from '@/features/operations/model'
import { EmptyRow, Field, runAction, StatusBadge } from '@/features/operations/ui'
import { Button } from '@planisfy/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@planisfy/ui/components/card'
import { Input } from '@planisfy/ui/components/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@planisfy/ui/components/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@planisfy/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@planisfy/ui/components/table'
import { ArchiveRestore, MoreHorizontal } from 'lucide-react'

export function BackupsTab({
  backups,
  onChanged,
}: {
  backups: ConsoleArtifactBackup[]
  onChanged: () => void
}) {
  const [storageObjectId, setStorageObjectId] = useState('')
  const backupSources = useMemo(
    () => backups.filter((backup) => backup.storageObjectId && backup.sourceStorageKey),
    [backups]
  )

  async function createBackup() {
    await runAction(
      () => api.createArtifactBackup(storageObjectId),
      'Backup created',
      () => {
        setStorageObjectId('')
        onChanged()
      }
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create Backup</CardTitle>
          <CardDescription>
            Copy a dataset or tile artifact from its storage key into backup storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {backupSources.length > 0 && (
            <Field label="Recent artifact">
              <Select
                value={storageObjectId || 'manual'}
                onValueChange={(value) => setStorageObjectId(value === 'manual' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual ID</SelectItem>
                  {backupSources.map((backup) => (
                    <SelectItem key={backup.id} value={backup.storageObjectId ?? ''}>
                      {backup.sourceStorageKey}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Storage object ID">
            <Input value={storageObjectId} onChange={(e) => setStorageObjectId(e.target.value)} />
          </Field>
          <Button onClick={createBackup} disabled={!storageObjectId}>
            <ArchiveRestore className="mr-1.5 h-4 w-4" />
            Back up
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Artifact Backups</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell>
                    <StatusBadge status={backup.status} />
                  </TableCell>
                  <TableCell>{backup.provider}</TableCell>
                  <TableCell>{formatBytes(backup.size)}</TableCell>
                  <TableCell>{formatDate(backup.createdAt)}</TableCell>
                  <TableCell className="w-10 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for backup from ${backup.sourceStorageKey}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={backup.status === 'failed'}
                          onSelect={() =>
                            runAction(
                              () => api.restoreArtifactBackup(backup.id),
                              'Backup restored',
                              onChanged
                            )
                          }
                        >
                          <ArchiveRestore className="mr-2 h-4 w-4" />
                          Restore backup
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {backups.length === 0 && <EmptyRow colSpan={5} label="No artifact backups yet." />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
