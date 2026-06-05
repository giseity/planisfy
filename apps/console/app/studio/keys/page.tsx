"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import { Badge } from "@planisfy/ui/components/badge"
import { Label } from "@planisfy/ui/components/label"
import { Checkbox } from "@planisfy/ui/components/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@planisfy/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@planisfy/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select"
import { Plus, Copy, MoreHorizontal, Key, AlertTriangle, RefreshCw, Trash2, Check } from "lucide-react"
import { toast } from "sonner"

const ALL_SCOPES = [
  { value: "tiles:read", label: "Tiles", description: "Access vector/raster tiles" },
  { value: "styles:read", label: "Styles (read)", description: "Read public/owned styles" },
  { value: "styles:write", label: "Styles (write)", description: "Create/update styles" },
  { value: "geocoding", label: "Geocoding", description: "Forward/reverse geocoding" },
  { value: "directions", label: "Directions", description: "Routing, isochrone, matrix" },
  { value: "elevation", label: "Elevation", description: "Elevation queries" },
  { value: "static", label: "Static images", description: "Static map images" },
  { value: "sources:read", label: "Tilesets (read)", description: "List tilesets" },
  { value: "sources:write", label: "Tilesets (write)", description: "Upload/manage tilesets" },
  { value: "usage:read", label: "Usage", description: "Read usage stats" },
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

function timeAgo(date: string | null): string {
  if (!date) return "Never"
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Just now"
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

  const fetchKeys = useCallback(async () => {
    try {
      const res = await api.get<{ data: ApiKeyData[] }>("/keys")
      setKeys(res.data)
    } catch (err) {
      console.error("Failed to fetch keys:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const handleCreate = async (formData: FormData) => {
    const name = formData.get("name") as string
    const scopeValues = ALL_SCOPES.map((s) => s.value).filter(
      (v) => formData.get(`scope_${v}`) === "on"
    )
    const domains = (formData.get("domains") as string)
      ?.split(",")
      .map((d) => d.trim())
      .filter(Boolean) || []
    const expiry = formData.get("expiry") as string

    let expiresAt: string | null = null
    if (expiry && expiry !== "never") {
      const d = new Date()
      if (expiry === "30d") d.setDate(d.getDate() + 30)
      else if (expiry === "90d") d.setDate(d.getDate() + 90)
      else if (expiry === "1y") d.setFullYear(d.getFullYear() + 1)
      expiresAt = d.toISOString()
    }

    try {
      const res = await api.post<{ data: { id: string; key: string } }>("/keys", {
        name,
        scopes: scopeValues,
        allowedDomains: domains,
        expiresAt,
      })
      setRevealedKey(res.data.key)
      setCreateOpen(false)
      fetchKeys()
    } catch {
      toast.error("Failed to create key")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await api.delete(`/keys/${deleteId}`)
      setDeleteId(null)
      toast.success("API key revoked")
      fetchKeys()
    } catch {
      toast.error("Failed to revoke key")
    }
  }

  const handleRotate = async () => {
    if (!rotateId) return
    try {
      const res = await api.post<{ data: { key: string } }>(`/keys/${rotateId}/rotate`)
      setRotateId(null)
      setRevealedKey(res.data.key)
      fetchKeys()
    } catch {
      toast.error("Failed to rotate key")
    }
  }

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create key
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form action={handleCreate}>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  Select the permissions this key should have.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="My app key" required className="mt-1" />
                </div>

                <div>
                  <Label>Scopes</Label>
                  <div className="mt-2 space-y-2">
                    {ALL_SCOPES.map((scope) => (
                      <label key={scope.value} className="flex items-start gap-2 cursor-pointer">
                        <Checkbox name={`scope_${scope.value}`} defaultChecked={scope.value === "tiles:read" || scope.value === "styles:read"} className="mt-0.5" />
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
            <Button
              variant="outline"
              onClick={() => revealedKey && copyKey(revealedKey)}
            >
              {copiedKey ? (
                <><Check className="h-4 w-4 mr-2" />Copied</>
              ) : (
                <><Copy className="h-4 w-4 mr-2" />Copy</>
              )}
            </Button>
            <Button onClick={() => setRevealedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key?</DialogTitle>
            <DialogDescription>
              Any applications using this key will lose access immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Revoke</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate confirmation */}
      <Dialog open={!!rotateId} onOpenChange={() => setRotateId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate API key?</DialogTitle>
            <DialogDescription>
              The current key will stop working immediately. A new key will be generated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateId(null)}>Cancel</Button>
            <Button onClick={handleRotate}>Rotate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keys table */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg border bg-muted animate-pulse" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Key className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No API keys</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create a key to access the Planisfy API from your applications.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create key
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {key.id.slice(0, 12)}...
                  </code>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(key.scopes as string[]).slice(0, 3).map((scope) => (
                      <Badge key={scope} variant="secondary" className="text-[10px]">
                        {scope}
                      </Badge>
                    ))}
                    {(key.scopes as string[]).length > 3 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{(key.scopes as string[]).length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {timeAgo(key.lastUsedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(key.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge variant={key.status === "active" ? "success" : "destructive"}>
                    {key.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRotateId(key.id)}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Rotate key
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(key.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Revoke
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
