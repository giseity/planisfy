"use client"

import { useStyleStore } from "@/lib/store/style-store"
import { StringField } from "./fields/string-field"
import { NumberField } from "./fields/number-field"
import { ScrollArea } from "@planisfy/ui/components/scroll-area"
import { Button } from "@planisfy/ui/components/button"
import { Separator } from "@planisfy/ui/components/separator"
import { Crosshair } from "lucide-react"

export function StyleSettingsPanel() {
  const style = useStyleStore((s) => s.style)
  const updateStyleName = useStyleStore((s) => s.updateStyleName)
  const updateStyleTopLevel = useStyleStore((s) => s.updateStyleTopLevel)
  const mapPosition = useStyleStore((s) => s.mapPosition)

  if (!style) return null

  const center = (style as any).center as [number, number] | undefined
  const zoom = (style as any).zoom as number | undefined
  const bearing = (style as any).bearing as number | undefined
  const pitch = (style as any).pitch as number | undefined

  const applyMapPosition = () => {
    if (!mapPosition) return
    updateStyleTopLevel("center", mapPosition.center)
    updateStyleTopLevel("zoom", Math.round(mapPosition.zoom * 100) / 100)
    updateStyleTopLevel("bearing", Math.round(mapPosition.bearing * 100) / 100)
    updateStyleTopLevel("pitch", Math.round(mapPosition.pitch * 100) / 100)
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        <SectionTitle>General</SectionTitle>
        <StringField
          label="name"
          value={style.name ?? ""}
          onChange={(v) => updateStyleName(v)}
        />

        <Separator />

        <SectionTitle>Resources</SectionTitle>
        <StringField
          label="sprite"
          value={(style.sprite as string) ?? ""}
          onChange={(v) => updateStyleTopLevel("sprite", v || undefined)}
          placeholder="https://example.com/sprite"
        />
        <StringField
          label="glyphs"
          value={(style.glyphs as string) ?? ""}
          onChange={(v) => updateStyleTopLevel("glyphs", v || undefined)}
          placeholder="https://example.com/font/{fontstack}/{range}.pbf"
        />

        <Separator />

        <div className="flex items-center justify-between">
          <SectionTitle>Default View</SectionTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 text-[10px]"
            onClick={applyMapPosition}
            disabled={!mapPosition}
            title="Use current map position"
          >
            <Crosshair className="h-3 w-3" />
            Use map position
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="center lng"
            value={center?.[0] ?? 0}
            onChange={(v) => updateStyleTopLevel("center", [v, center?.[1] ?? 0])}
            min={-180}
            max={180}
            step={0.01}
            showSlider={false}
          />
          <NumberField
            label="center lat"
            value={center?.[1] ?? 0}
            onChange={(v) => updateStyleTopLevel("center", [center?.[0] ?? 0, v])}
            min={-90}
            max={90}
            step={0.01}
            showSlider={false}
          />
        </div>
        <NumberField
          label="zoom"
          value={zoom ?? 0}
          onChange={(v) => updateStyleTopLevel("zoom", v)}
          min={0}
          max={24}
          step={0.1}
          showSlider
        />
        <NumberField
          label="bearing"
          value={bearing ?? 0}
          onChange={(v) => updateStyleTopLevel("bearing", v)}
          min={0}
          max={360}
          step={1}
          showSlider={false}
        />
        <NumberField
          label="pitch"
          value={pitch ?? 0}
          onChange={(v) => updateStyleTopLevel("pitch", v)}
          min={0}
          max={85}
          step={1}
          showSlider={false}
        />

        {mapPosition && (
          <div className="rounded bg-muted/30 p-2 text-[10px] text-muted-foreground font-mono">
            <div>Current: {mapPosition.center[0].toFixed(4)}, {mapPosition.center[1].toFixed(4)}</div>
            <div>Zoom: {mapPosition.zoom.toFixed(2)} | Bearing: {mapPosition.bearing.toFixed(0)} | Pitch: {mapPosition.pitch.toFixed(0)}</div>
          </div>
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
