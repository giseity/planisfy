"use client"

import { useStyleStore } from "@/lib/store/style-store"
import { ScrollArea } from "@planisfy/ui/components/scroll-area"
import {
  Eye,
  EyeOff,
  Square,
  Minus,
  Type,
  Circle,
  Layers,
  Copy,
  Trash2,
} from "lucide-react"
import { cn } from "@planisfy/ui/lib/utils"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import { useState } from "react"

const layerTypeIcons: Record<string, React.ElementType> = {
  background: Square,
  fill: Square,
  line: Minus,
  symbol: Type,
  circle: Circle,
  "fill-extrusion": Layers,
  raster: Layers,
  hillshade: Layers,
  heatmap: Layers,
}

export function LayerList() {
  const style = useStyleStore((s) => s.style)
  const selectedLayerId = useStyleStore((s) => s.selectedLayerId)
  const setSelectedLayer = useStyleStore((s) => s.setSelectedLayer)
  const setLayerVisibility = useStyleStore((s) => s.setLayerVisibility)
  const deleteLayer = useStyleStore((s) => s.deleteLayer)
  const duplicateLayer = useStyleStore((s) => s.duplicateLayer)
  const [filter, setFilter] = useState("")

  if (!style) return null

  const layers = style.layers.filter((l) =>
    filter ? l.id.toLowerCase().includes(filter.toLowerCase()) : true
  )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2">
        <Input
          placeholder="Filter layers..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {layers.map((layer) => {
            const Icon = layerTypeIcons[layer.type] || Layers
            const isSelected = layer.id === selectedLayerId
            const isVisible =
              !("layout" in layer) ||
              !layer.layout ||
              (layer.layout as any).visibility !== "none"

            return (
              <div
                key={layer.id}
                className={cn(
                  "group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs cursor-pointer hover:bg-accent",
                  isSelected && "bg-accent"
                )}
                onClick={() => setSelectedLayer(layer.id)}
              >
                <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{layer.id}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicateLayer(layer.id)
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteLayer(layer.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <button
                  className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLayerVisibility(layer.id, !isVisible)
                  }}
                >
                  {isVisible ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
