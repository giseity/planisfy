"use client"

import { useStyleStore } from "@/lib/store/style-store"
import { SpecField } from "./fields/spec-field"
import { FilterField } from "./fields/filter-field"
import { EnumField } from "./fields/enum-field"
import { StringField } from "./fields/string-field"
import { NumberField } from "./fields/number-field"
import { Separator } from "@planisfy/ui/components/separator"
import { ScrollArea } from "@planisfy/ui/components/scroll-area"
import {
  getPaintSpec,
  getLayoutSpec,
  LAYER_TYPES,
  SOURCE_FREE_LAYER_TYPES,
  type PropertySpec,
} from "@/lib/style-spec"
import type { LayerSpecification } from "maplibre-gl"

type LayerRecord = LayerSpecification & {
  "source-layer"?: string
}

export function PropertyPanel() {
  const selectedLayerId = useStyleStore((s) => s.selectedLayerId)
  const style = useStyleStore((s) => s.style)
  const updateLayerPaint = useStyleStore((s) => s.updateLayerPaint)
  const updateLayerLayout = useStyleStore((s) => s.updateLayerLayout)
  const updateLayerTopLevel = useStyleStore((s) => s.updateLayerTopLevel)

  if (!style || !selectedLayerId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
        Select a layer to edit
      </div>
    )
  }

  const layer = style.layers.find((l) => l.id === selectedLayerId)
  if (!layer) return null

  const paintSpec = getPaintSpec(layer.type)
  const layoutSpec = getLayoutSpec(layer.type)
  const paint = ("paint" in layer ? layer.paint : {}) as Record<string, unknown> | undefined
  const layout = ("layout" in layer ? layer.layout : {}) as Record<string, unknown> | undefined

  const paintKeys = Object.keys(paintSpec)
  const layoutKeys = Object.keys(layoutSpec).filter((k) => k !== "visibility")

  const spriteUrl = style.sprite as string | undefined
  const glyphsUrl = style.glyphs as string | undefined

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        {/* Layer header */}
        <LayerHeader layer={layer} onTopLevelChange={updateLayerTopLevel} style={style} />

        <Separator />

        {/* Layout properties */}
        {layoutKeys.length > 0 && (
          <>
            <SectionTitle>Layout</SectionTitle>
            {layoutKeys.map((key) => (
              <SpecField
                key={key}
                property={key}
                spec={layoutSpec[key] as PropertySpec}
                value={layout?.[key]}
                onChange={(v) => updateLayerLayout(selectedLayerId, key, v)}
                spriteUrl={spriteUrl}
                glyphsUrl={glyphsUrl}
              />
            ))}
            <Separator />
          </>
        )}

        {/* Paint properties */}
        <SectionTitle>Paint</SectionTitle>
        {paintKeys.map((key) => (
          <SpecField
            key={key}
            property={key}
            spec={paintSpec[key] as PropertySpec}
            value={paint?.[key]}
            onChange={(v) => updateLayerPaint(selectedLayerId, key, v)}
            spriteUrl={spriteUrl}
            glyphsUrl={glyphsUrl}
          />
        ))}

        {/* Filter */}
        {"filter" in layer && (
          <>
            <Separator />
            <FilterField
              value={layer.filter}
              onChange={(v) => updateLayerTopLevel(selectedLayerId, "filter", v)}
            />
          </>
        )}
      </div>
    </ScrollArea>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

function LayerHeader({
  layer,
  onTopLevelChange,
  style,
}: {
  layer: LayerSpecification
  onTopLevelChange: (layerId: string, key: string, value: unknown) => void
  style: { sources: Record<string, unknown> }
}) {
  const sourceIds = Object.keys(style.sources)
  const needsSource = !SOURCE_FREE_LAYER_TYPES.includes(layer.type)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
          {layer.type}
        </span>
        <span className="text-sm font-medium truncate">{layer.id}</span>
      </div>

      <EnumField
        label="type"
        value={layer.type}
        options={LAYER_TYPES}
        onChange={(v) => onTopLevelChange(layer.id, "type", v)}
      />

      {needsSource && (
        <>
          <EnumField
            label="source"
            value={"source" in layer ? (layer.source as string) ?? "" : ""}
            options={sourceIds}
            onChange={(v) => onTopLevelChange(layer.id, "source", v)}
          />
          <StringField
            label="source-layer"
            value={(layer as LayerRecord)["source-layer"] ?? ""}
            onChange={(v) => onTopLevelChange(layer.id, "source-layer", v)}
            placeholder="e.g. water, transportation"
          />
        </>
      )}

      <NumberField
        label="minzoom"
        value={"minzoom" in layer ? (layer.minzoom as number) ?? 0 : 0}
        onChange={(v) => onTopLevelChange(layer.id, "minzoom", v)}
        min={0}
        max={24}
        step={1}
        showSlider={false}
      />
      <NumberField
        label="maxzoom"
        value={"maxzoom" in layer ? (layer.maxzoom as number) ?? 24 : 24}
        onChange={(v) => onTopLevelChange(layer.id, "maxzoom", v)}
        min={0}
        max={24}
        step={1}
        showSlider={false}
      />
    </div>
  )
}
