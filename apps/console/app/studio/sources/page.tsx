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
import { Plus, Upload, Trash2, RefreshCw } from "lucide-react"

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
    } catch (err) {
      console.error("Failed to fetch sources:", err)
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
      fetchSources()
    } catch (err) {
      console.error("Failed to create source:", err)
    }
  }

  async function handleUpload(sourceId: string, file: File) {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      await api.upload(`/sources/${sourceId}/upload`, formData)
      fetchSources()
    } catch (err) {
      console.error("Failed to upload file:", err)
    } finally {
      setUploading(false)
      setUploadSourceId(null)
    }
  }

  async function handleDelete(sourceId: string) {
    if (!confirm("Delete this source? This cannot be undone.")) return
    try {
      await api.delete(`/sources/${sourceId}`)
      fetchSources()
    } catch (err) {
      console.error("Failed to delete source:", err)
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
        <p className="text-muted-foreground">Loading sources...</p>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">No sources yet</p>
          <p className="text-sm">Create a source and upload GeoJSON, CSV, or PMTiles data.</p>
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
