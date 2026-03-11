"use client"

import { useEffect, useCallback, useState } from "react"
import { useStyleStore } from "@/lib/store/style-store"
import { sampleStyle } from "@/lib/sample-style"
import { MapPreview } from "@/components/studio/map-preview"
import { LayerList } from "@/components/studio/layer-list"
import { PropertyPanel } from "@/components/studio/property-panel"
import { SourcePanel } from "@/components/studio/source-panel"
import { JsonEditor } from "@/components/studio/json-editor"
import { Separator } from "@planisfy/ui/components/separator"
import { Button } from "@planisfy/ui/components/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@planisfy/ui/components/tabs"
import { Download, Upload, Undo2, Redo2, Code2 } from "lucide-react"

export default function StyleEditorPage() {
  const loadStyle = useStyleStore((s) => s.loadStyle)
  const style = useStyleStore((s) => s.style)
  const styleName = useStyleStore((s) => s.style?.name)
  const updateStyleName = useStyleStore((s) => s.updateStyleName)
  const undo = useStyleStore((s) => s.undo)
  const redo = useStyleStore((s) => s.redo)
  const canUndo = useStyleStore((s) => s.canUndo)
  const canRedo = useStyleStore((s) => s.canRedo)
  const [showJson, setShowJson] = useState(false)

  // Load sample style on mount (Phase 2 — no backend yet)
  useEffect(() => {
    loadStyle(sampleStyle)
  }, [loadStyle])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      // Cmd+Z — undo
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      // Cmd+Shift+Z or Cmd+Y — redo
      if ((mod && e.key === "z" && e.shiftKey) || (mod && e.key === "y")) {
        e.preventDefault()
        redo()
        return
      }
    },
    [undo, redo]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

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
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={undo}
          disabled={!canUndo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={redo}
          disabled={!canRedo()}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <Button
          variant={showJson ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowJson(!showJson)}
          title="Toggle JSON editor"
        >
          <Code2 className="h-3 w-3" />
          JSON
        </Button>
        <Separator orientation="vertical" className="h-5" />
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
        {/* Left panel — Layers + Sources */}
        <aside className="flex w-60 flex-col border-r bg-background">
          <Tabs defaultValue="layers" className="flex flex-1 flex-col">
            <TabsList className="mx-2 mt-1 h-7">
              <TabsTrigger value="layers" className="text-xs h-6">
                Layers ({style.layers.length})
              </TabsTrigger>
              <TabsTrigger value="sources" className="text-xs h-6">
                Sources ({Object.keys(style.sources).length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="layers" className="flex-1 overflow-hidden mt-0">
              <LayerList />
            </TabsContent>
            <TabsContent value="sources" className="flex-1 overflow-hidden mt-0">
              <SourcePanel />
            </TabsContent>
          </Tabs>
        </aside>

        {/* Map + optional JSON editor */}
        <main className="flex flex-1 flex-col">
          <div className={showJson ? "flex-1 basis-1/2" : "flex-1"}>
            <MapPreview />
          </div>
          {showJson && (
            <div className="basis-1/2 border-t">
              <JsonEditor />
            </div>
          )}
        </main>

        {/* Right panel — Properties */}
        <aside className="w-72 border-l bg-background">
          <PropertyPanel />
        </aside>
      </div>
    </div>
  )
}
