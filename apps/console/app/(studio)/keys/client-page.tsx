'use client'

import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react'
import { ApiRequestError, api, type ConsoleProfile, type PlatformPreflight } from '@/lib/api'
import { Button } from '@planisfy/ui/components/button'
import { Input } from '@planisfy/ui/components/input'
import { Badge } from '@planisfy/ui/components/badge'
import { Label } from '@planisfy/ui/components/label'
import { Checkbox } from '@planisfy/ui/components/checkbox'
import { DataTable } from '@planisfy/ui/components/data-table'
import { EmptyState } from '@planisfy/ui/components/empty-state'
import { LoadingState } from '@planisfy/ui/components/loading-state'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@planisfy/ui/components/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@planisfy/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@planisfy/ui/components/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@planisfy/ui/components/select'
import { StatusAlert } from '@planisfy/ui/components/status-alert'
import {
  Plus,
  Copy,
  MoreHorizontal,
  Key,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'

const ALL_SCOPES = [
  { value: 'tiles:read', label: 'Tiles', description: 'Access vector/raster tiles' },
  { value: 'styles:read', label: 'Styles (read)', description: 'Read public/owned styles' },
  { value: 'styles:write', label: 'Styles (write)', description: 'Create/update styles' },
  { value: 'geocoding', label: 'Geocoding', description: 'Forward/reverse geocoding' },
  { value: 'directions', label: 'Directions', description: 'Routing, isochrone, matrix' },
  { value: 'elevation', label: 'Elevation', description: 'Elevation queries' },
  { value: 'static', label: 'Static images', description: 'Static map images' },
  { value: 'sources:read', label: 'Tilesets (read)', description: 'List tilesets' },
  { value: 'sources:write', label: 'Tilesets (write)', description: 'Upload/manage tilesets' },
  { value: 'usage:read', label: 'Usage', description: 'Read usage stats' },
] as const

interface ApiKeyData {
  id: string
  name: string
  scopes: string[]
  allowedDomains: string[] | null
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  status: string
  prefix: string
}

type ApiKeyTableCell = {
  row: {
    original: ApiKeyData
  }
}

function timeAgo(date: string | null): string {
  if (!date) return 'Never'
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyData[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [rotateId, setRotateId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ConsoleProfile | null>(null)
  const [preflight, setPreflight] = useState<PlatformPreflight | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await api.get<{ data: ApiKeyData[] }>('/keys')
      setKeys(res.data)
    } catch (err) {
      console.error('Failed to fetch keys:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  useEffect(() => {
    Promise.all([api.getProfile(), api.getPlatformPreflight()])
      .then(([profileRes, preflightRes]) => {
        setProfile(profileRes.data)
        setPreflight(preflightRes.data)
      })
      .catch(() => {})
  }, [])

  const managedEmailBlocked =
    preflight?.deploymentMode === 'managed' && profile?.emailVerified === false

  const columns = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }: ApiKeyTableCell) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'id',
        header: 'Key',
        cell: ({ row }: ApiKeyTableCell) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {row.original.id.slice(0, 12)}...
          </code>
        ),
      },
      {
        accessorFn: (row: ApiKeyData) => row.scopes.join(', '),
        id: 'scopes',
        header: 'Scopes',
        cell: ({ row }: ApiKeyTableCell) => (
          <div className="flex flex-wrap gap-1">
            {row.original.scopes.slice(0, 3).map((scope) => (
              <Badge key={scope} variant="secondary" className="text-[10px]">
                {scope}
              </Badge>
            ))}
            {row.original.scopes.length > 3 && (
              <Badge variant="secondary" className="text-[10px]">
                +{row.original.scopes.length - 3}
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'lastUsedAt',
        header: 'Last used',
        cell: ({ row }: ApiKeyTableCell) => (
          <span className="text-sm text-muted-foreground">{timeAgo(row.original.lastUsedAt)}</span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }: ApiKeyTableCell) => (
          <span className="text-sm text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }: ApiKeyTableCell) => (
          <Badge variant={row.original.status === 'active' ? 'success' : 'destructive'}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }: ApiKeyTableCell) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={managedEmailBlocked}
                onClick={() => setRotateId(row.original.id)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Rotate key
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteId(row.original.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Revoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [managedEmailBlocked]
  )

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (managedEmailBlocked) {
      toast.error('Verify your email before creating API keys')
      return
    }

    const formData = new FormData(event.currentTarget)
    const name = formData.get('name') as string
    const scopeValues = ALL_SCOPES.map((s) => s.value).filter(
      (v) => formData.get(`scope_${v}`) === 'on'
    )
    const domains =
      (formData.get('domains') as string)
        ?.split(',')
        .map((d) => d.trim())
        .filter(Boolean) || []
    const expiry = formData.get('expiry') as string

    let expiresAt: string | null = null
    if (expiry && expiry !== 'never') {
      const d = new Date()
      if (expiry === '30d') d.setDate(d.getDate() + 30)
      else if (expiry === '90d') d.setDate(d.getDate() + 90)
      else if (expiry === '1y') d.setFullYear(d.getFullYear() + 1)
      expiresAt = d.toISOString()
    }

    try {
      const res = await api.post<{ data: { id: string; key: string } }>('/keys', {
        name,
        scopes: scopeValues,
        allowedDomains: domains,
        expiresAt,
      })
      setRevealedKey(res.data.key)
      setCreateOpen(false)
      fetchKeys()
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        toast.error('Verify your email before creating API keys')
        return
      }
      toast.error('Failed to create key')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await api.delete(`/keys/${deleteId}`)
      setDeleteId(null)
      toast.success('API key revoked')
      fetchKeys()
    } catch {
      toast.error('Failed to revoke key')
    }
  }

  const handleRotate = async () => {
    if (!rotateId) return
    if (managedEmailBlocked) {
      toast.error('Verify your email before rotating API keys')
      return
    }

    try {
      const res = await api.post<{ data: { key: string } }>(`/keys/${rotateId}/rotate`)
      setRotateId(null)
      setRevealedKey(res.data.key)
      fetchKeys()
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        toast.error('Verify your email before rotating API keys')
        return
      }
      toast.error('Failed to rotate key')
    }
  }

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button disabled={managedEmailBlocked}>
              <Plus className="h-4 w-4 mr-2" />
              Create key
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100vh-2rem)] max-w-lg overflow-hidden">
            <form onSubmit={handleCreate} className="flex max-h-[calc(100vh-5rem)] flex-col">
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>Select the permissions this key should have.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-2">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="My app key" required className="mt-1" />
                </div>

                <div>
                  <Label>Scopes</Label>
                  <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                    {ALL_SCOPES.map((scope) => (
                      <label key={scope.value} className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          name={`scope_${scope.value}`}
                          defaultChecked={
                            scope.value === 'tiles:read' || scope.value === 'styles:read'
                          }
                          className="mt-0.5"
                        />
                        <div>
                          <div className="text-sm font-medium">{scope.label}</div>
                          <div className="text-xs text-muted-foreground">{scope.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="domains">Allowed domains (optional)</Label>
                  <Input
                    id="domains"
                    name="domains"
                    placeholder="example.com, *.example.com"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty to allow all domains
                  </p>
                </div>

                <div>
                  <Label htmlFor="expiry">Expiration</Label>
                  <Select name="expiry" defaultValue="never">
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never</SelectItem>
                      <SelectItem value="30d">30 days</SelectItem>
                      <SelectItem value="90d">90 days</SelectItem>
                      <SelectItem value="1y">1 year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {managedEmailBlocked && (
        <div className="mb-6">
          <StatusAlert
            variant="warning"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Email verification required"
            description="Verify your email before creating or rotating managed API keys."
          />
        </div>
      )}

      {/* Key revealed dialog */}
      <Dialog open={!!revealedKey} onOpenChange={() => setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Copy your API key
            </DialogTitle>
            <DialogDescription>
              This is the only time you&apos;ll see the full key. Store it securely.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-md p-3 font-mono text-sm break-all select-all">
            {revealedKey}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => revealedKey && copyKey(revealedKey)}>
              {copiedKey ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
            <Button onClick={() => setRevealedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              Any applications using this key will lose access immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rotate confirmation */}
      <AlertDialog open={!!rotateId} onOpenChange={() => setRotateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API key?</AlertDialogTitle>
            <AlertDialogDescription>
              The current key will stop working immediately. A new key will be generated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotate}>Rotate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Keys table */}
      {loading ? (
        <LoadingState label="Loading API keys..." />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={<Key className="h-12 w-12" />}
          title="No API keys"
          description="Create a key to access the Planisfy API from your applications."
          action={
            <Button disabled={managedEmailBlocked} onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create key
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={keys}
          filterColumn="name"
          filterPlaceholder="Filter keys..."
          emptyText="No API keys match your filter."
        />
      )}
    </div>
  )
}
