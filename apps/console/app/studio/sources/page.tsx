"use client"

import { useEffect, useState, useRef } from "react"
import { api } from "@/lib/api"
import { Badge } from "@planisfy/ui/components/badge"
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@planisfy/ui/components/dialog"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import { Label } from "@planisfy/ui/components/label"
import { Plus, Upload, Trash2, RefreshCw, Database } from "lucide-react"
import { toast } from "sonner"

interface Source {
  id: string
  name: string
  handle: string
  type: string
  url: string
  status: string
  minZoom: number | null
  maxZoom: number | null
  bounds: unknown
  createdAt: string
  updatedAt: string
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [uploadSourceId, setUploadSourceId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newHandle, setNewHandle] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function fetchSources() {
    try {
      const data = await api.get<Source[]>("/sources")
      setSources(data)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSources()
    // Poll for status updates
    const interval = setInterval(fetchSources, 5000)
    return () => clearInterval(interval)
  }, [])

  async function handleCreate() {
    if (!newName || !newHandle) return
    try {
      await api.post("/sources", { name: newName, handle: newHandle })
      setNewName("")
      setNewHandle("")
      setCreateOpen(false)
      toast.success("Source created")
      fetchSources()
    } catch {
      toast.error("Failed to create source")
    }
  }

  async function handleUpload(sourceId: string, file: File) {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      await api.upload(`/sources/${sourceId}/upload`, formData)
      toast.success("File uploaded — processing started")
      fetchSources()
    } catch {
      toast.error("Failed to upload file")
    } finally {
      setUploading(false)
      setUploadSourceId(null)
    }
  }

  async function handleDelete(sourceId: string) {
    if (!confirm("Delete this source? This cannot be undone.")) return
    try {
      await api.delete(`/sources/${sourceId}`)
      toast.success("Source deleted")
      fetchSources()
    } catch {
      toast.error("Failed to delete source")
    }
  }

  function statusVariant(status: string) {
    switch (status) {
      case "READY": return "success" as const
      case "PROCESSING": return "warning" as const
      case "ERROR": return "destructive" as const
      default: return "secondary" as const
    }
  }

  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sources</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add source
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Source</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Dataset"
                />
              </div>
              <div className="space-y-2">
                <Label>Handle</Label>
                <Input
                  value={newHandle}
                  onChange={(e) => setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  placeholder="my-dataset"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, hyphens, and underscores only
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!newName || !newHandle}>
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg border bg-muted animate-pulse" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Database className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No sources yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create a source and upload GeoJSON, CSV, or PMTiles data.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add source
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Handle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Zoom</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.id}>
                <TableCell className="font-medium">{source.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {source.handle}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {source.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(source.status)}>
                    {source.status === "PROCESSING" && (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    )}
                    {source.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {source.minZoom ?? 0}-{source.maxZoom ?? 22}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(source.updatedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUploadSourceId(source.id)
                        fileInputRef.current?.click()
                      }}
                      disabled={source.status === "PROCESSING" || uploading}
                      title="Upload data"
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(source.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".geojson,.json,.csv,.pmtiles"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && uploadSourceId) {
            handleUpload(uploadSourceId, file)
          }
          e.target.value = ""
        }}
      />
    </div>
  )
}
