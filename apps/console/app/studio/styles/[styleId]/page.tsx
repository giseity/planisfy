"use client"

import { useEffect } from "react"
import { useStyleStore } from "@/lib/store/style-store"
import { sampleStyle } from "@/lib/sample-style"
import { MapPreview } from "@/components/studio/map-preview"
import { LayerList } from "@/components/studio/layer-list"
import { PropertyPanel } from "@/components/studio/property-panel"
import { Separator } from "@planisfy/ui/components/separator"
import { Button } from "@planisfy/ui/components/button"
import { Download, Upload } from "lucide-react"

export default function StyleEditorPage() {
  const loadStyle = useStyleStore((s) => s.loadStyle)
  const style = useStyleStore((s) => s.style)
  const styleName = useStyleStore((s) => s.style?.name)
  const updateStyleName = useStyleStore((s) => s.updateStyleName)

  // Load sample style on mount (Phase 2 — no backend yet)
  useEffect(() => {
    loadStyle(sampleStyle)
  }, [loadStyle])

  const handleExport = () => {
    if (!style) return
    const blob = new Blob([JSON.stringify(style, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${style.name || "style"}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const json = JSON.parse(text)
        if (json.version === 8 && Array.isArray(json.layers)) {
          loadStyle(json)
        }
      } catch {
        // Invalid file
      }
    }
    input.click()
  }

  if (!style) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading style editor...</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Toolbar */}
      <header className="flex h-10 items-center gap-2 border-b bg-background px-3">
        <input
          value={styleName ?? ""}
          onChange={(e) => updateStyleName(e.target.value)}
          className="h-7 border-none bg-transparent text-sm font-medium outline-none focus:ring-0"
          placeholder="Style name"
        />
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleImport}>
          <Upload className="h-3 w-3" />
          Import
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleExport}>
          <Download className="h-3 w-3" />
          Export
        </Button>
      </header>

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Layer list */}
        <aside className="flex w-60 flex-col border-r bg-background">
          <div className="flex h-8 items-center px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Layers ({style.layers.length})
          </div>
          <Separator />
          <div className="flex-1 overflow-hidden">
            <LayerList />
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1">
          <MapPreview />
        </main>

        {/* Right panel — Properties */}
        <aside className="w-72 border-l bg-background">
          <PropertyPanel />
        </aside>
      </div>
    </div>
  )
}
