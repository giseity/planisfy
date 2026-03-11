"use client"

import { useStyleStore } from "@/lib/store/style-store"
import { ColorField } from "./fields/color-field"
import { NumberField } from "./fields/number-field"
import { Separator } from "@planisfy/ui/components/separator"
import { ScrollArea } from "@planisfy/ui/components/scroll-area"

/**
 * Property panel that renders paint/layout editors for the selected layer.
 * Phase 2.1: supports background, fill, line, and symbol paint properties.
 */
export function PropertyPanel() {
  const selectedLayerId = useStyleStore((s) => s.selectedLayerId)
  const style = useStyleStore((s) => s.style)
  const updateLayerPaint = useStyleStore((s) => s.updateLayerPaint)

  if (!style || !selectedLayerId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
        Select a layer to edit
      </div>
    )
  }

  const layer = style.layers.find((l) => l.id === selectedLayerId)
  if (!layer) return null

  const paint = ("paint" in layer ? layer.paint : {}) as Record<string, any> | undefined

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {layer.type}
          </h3>
          <p className="text-sm font-medium">{layer.id}</p>
        </div>

        <Separator />

        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Paint Properties
        </div>

        {layer.type === "background" && (
          <BackgroundPaint layerId={layer.id} paint={paint} onChange={updateLayerPaint} />
        )}
        {layer.type === "fill" && (
          <FillPaint layerId={layer.id} paint={paint} onChange={updateLayerPaint} />
        )}
        {layer.type === "line" && (
          <LinePaint layerId={layer.id} paint={paint} onChange={updateLayerPaint} />
        )}
        {layer.type === "symbol" && (
          <SymbolPaint layerId={layer.id} paint={paint} onChange={updateLayerPaint} />
        )}
        {layer.type === "circle" && (
          <CirclePaint layerId={layer.id} paint={paint} onChange={updateLayerPaint} />
        )}

        {!["background", "fill", "line", "symbol", "circle"].includes(layer.type) && (
          <div className="text-xs text-muted-foreground">
            Property editor for &ldquo;{layer.type}&rdquo; layers coming soon.
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

type PaintProps = {
  layerId: string
  paint: Record<string, any> | undefined
  onChange: (layerId: string, property: string, value: unknown) => void
}

function BackgroundPaint({ layerId, paint, onChange }: PaintProps) {
  return (
    <div className="flex flex-col gap-3">
      <ColorField
        label="background-color"
        value={paint?.["background-color"] ?? "#000000"}
        onChange={(v) => onChange(layerId, "background-color", v)}
      />
      <NumberField
        label="background-opacity"
        value={paint?.["background-opacity"] ?? 1}
        onChange={(v) => onChange(layerId, "background-opacity", v)}
        min={0}
        max={1}
        step={0.01}
      />
    </div>
  )
}

function FillPaint({ layerId, paint, onChange }: PaintProps) {
  return (
    <div className="flex flex-col gap-3">
      <ColorField
        label="fill-color"
        value={paint?.["fill-color"] ?? "#000000"}
        onChange={(v) => onChange(layerId, "fill-color", v)}
      />
      <NumberField
        label="fill-opacity"
        value={paint?.["fill-opacity"] ?? 1}
        onChange={(v) => onChange(layerId, "fill-opacity", v)}
        min={0}
        max={1}
        step={0.01}
      />
      <ColorField
        label="fill-outline-color"
        value={paint?.["fill-outline-color"] ?? ""}
        onChange={(v) => onChange(layerId, "fill-outline-color", v)}
      />
    </div>
  )
}

function LinePaint({ layerId, paint, onChange }: PaintProps) {
  return (
    <div className="flex flex-col gap-3">
      <ColorField
        label="line-color"
        value={paint?.["line-color"] ?? "#000000"}
        onChange={(v) => onChange(layerId, "line-color", v)}
      />
      <NumberField
        label="line-width"
        value={paint?.["line-width"] ?? 1}
        onChange={(v) => onChange(layerId, "line-width", v)}
        min={0}
        max={20}
        step={0.5}
      />
      <NumberField
        label="line-opacity"
        value={paint?.["line-opacity"] ?? 1}
        onChange={(v) => onChange(layerId, "line-opacity", v)}
        min={0}
        max={1}
        step={0.01}
      />
    </div>
  )
}

function SymbolPaint({ layerId, paint, onChange }: PaintProps) {
  return (
    <div className="flex flex-col gap-3">
      <ColorField
        label="text-color"
        value={paint?.["text-color"] ?? "#000000"}
        onChange={(v) => onChange(layerId, "text-color", v)}
      />
      <ColorField
        label="text-halo-color"
        value={paint?.["text-halo-color"] ?? "#ffffff"}
        onChange={(v) => onChange(layerId, "text-halo-color", v)}
      />
      <NumberField
        label="text-halo-width"
        value={paint?.["text-halo-width"] ?? 0}
        onChange={(v) => onChange(layerId, "text-halo-width", v)}
        min={0}
        max={10}
        step={0.5}
      />
    </div>
  )
}

function CirclePaint({ layerId, paint, onChange }: PaintProps) {
  return (
    <div className="flex flex-col gap-3">
      <ColorField
        label="circle-color"
        value={paint?.["circle-color"] ?? "#000000"}
        onChange={(v) => onChange(layerId, "circle-color", v)}
      />
      <NumberField
        label="circle-radius"
        value={paint?.["circle-radius"] ?? 5}
        onChange={(v) => onChange(layerId, "circle-radius", v)}
        min={0}
        max={50}
        step={1}
      />
      <NumberField
        label="circle-opacity"
        value={paint?.["circle-opacity"] ?? 1}
        onChange={(v) => onChange(layerId, "circle-opacity", v)}
        min={0}
        max={1}
        step={0.01}
      />
      <ColorField
        label="circle-stroke-color"
        value={paint?.["circle-stroke-color"] ?? "#000000"}
        onChange={(v) => onChange(layerId, "circle-stroke-color", v)}
      />
      <NumberField
        label="circle-stroke-width"
        value={paint?.["circle-stroke-width"] ?? 0}
        onChange={(v) => onChange(layerId, "circle-stroke-width", v)}
        min={0}
        max={10}
        step={0.5}
      />
    </div>
  )
}
