"use client"

import { useStyleStore } from "@/lib/store/style-store"
import { ScrollArea } from "@planisfy/ui/components/scroll-area"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import { Label } from "@planisfy/ui/components/label"
import { Separator } from "@planisfy/ui/components/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select"
import { Plus, Trash2, Database } from "lucide-react"
import { useState } from "react"
import { SOURCE_TYPES, type SourceType } from "@/lib/style-spec/source"
import type { SourceSpecification } from "maplibre-gl"

export function SourcePanel() {
  const style = useStyleStore((s) => s.style)
  const addSource = useStyleStore((s) => s.addSource)
  const updateSource = useStyleStore((s) => s.updateSource)
  const deleteSource = useStyleStore((s) => s.deleteSource)
  const [showAdd, setShowAdd] = useState(false)

  if (!style) return null

  const sources = Object.entries(style.sources)

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sources ({sources.length})
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={() => setShowAdd(!showAdd)}
          >
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>

        {showAdd && (
          <AddSourceForm
            onAdd={(id, source) => {
              addSource(id, source)
              setShowAdd(false)
            }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {sources.map(([id, source]) => (
          <SourceItem
            key={id}
            sourceId={id}
            source={source as SourceSpecification}
            onUpdate={(s) => updateSource(id, s)}
            onDelete={() => deleteSource(id)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

function SourceItem({
  sourceId,
  source,
  onUpdate,
  onDelete,
}: {
  sourceId: string
  source: SourceSpecification
  onUpdate: (source: SourceSpecification) => void
  onDelete: () => void
}) {
  return (
    <div className="rounded border p-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Database className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">{sourceId}</span>
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
            {source.type}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {source.type === "vector" && "url" in source && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">URL</Label>
          <Input
            value={(source as any).url ?? ""}
            onChange={(e) => onUpdate({ ...source, url: e.target.value } as any)}
            className="h-6 text-xs font-mono"
            placeholder="https://tiles.example.com/data"
          />
        </div>
      )}

      {source.type === "geojson" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Data URL or inline</Label>
          <Input
            value={typeof (source as any).data === "string" ? (source as any).data : ""}
            onChange={(e) => onUpdate({ ...source, data: e.target.value } as any)}
            className="h-6 text-xs font-mono"
            placeholder="https://example.com/data.geojson"
          />
        </div>
      )}

      {(source.type === "raster" || source.type === "raster-dem") && "url" in source && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">TileJSON URL</Label>
          <Input
            value={(source as any).url ?? ""}
            onChange={(e) => onUpdate({ ...source, url: e.target.value } as any)}
            className="h-6 text-xs font-mono"
          />
        </div>
      )}
    </div>
  )
}

function AddSourceForm({
  onAdd,
  onCancel,
}: {
  onAdd: (id: string, source: SourceSpecification) => void
  onCancel: () => void
}) {
  const [sourceId, setSourceId] = useState("")
  const [sourceType, setSourceType] = useState<SourceType>("vector")
  const [url, setUrl] = useState("")

  const handleAdd = () => {
    if (!sourceId.trim()) return

    let source: SourceSpecification
    switch (sourceType) {
      case "vector":
        source = { type: "vector", url } as any
        break
      case "raster":
        source = { type: "raster", tiles: url ? [url] : [], tileSize: 256 } as any
        break
      case "raster-dem":
        source = { type: "raster-dem", url, tileSize: 256 } as any
        break
      case "geojson":
        source = {
          type: "geojson",
          data: url || { type: "FeatureCollection", features: [] },
        } as any
        break
      case "image":
        source = { type: "image", url, coordinates: [[0, 0], [1, 0], [1, 1], [0, 1]] } as any
        break
      case "video":
        source = { type: "video", urls: url ? [url] : [], coordinates: [[0, 0], [1, 0], [1, 1], [0, 1]] } as any
        break
      default:
        return
    }

    onAdd(sourceId, source)
  }

  return (
    <div className="rounded border bg-muted/30 p-2 space-y-2">
      <div className="space-y-1">
        <Label className="text-[10px]">Source ID</Label>
        <Input
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="h-6 text-xs"
          placeholder="my-source"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Type</Label>
        <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
          <SelectTrigger className="h-6 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-6 text-xs font-mono"
          placeholder="https://..."
        />
      </div>
      <div className="flex gap-1">
        <Button size="sm" className="h-6 text-xs flex-1" onClick={handleAdd}>
          Add
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
