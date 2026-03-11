"use client"

import { useEffect, useCallback, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useStyleStore } from "@/lib/store/style-store"
import { sampleStyle } from "@/lib/sample-style"
import { MapPreview } from "@/components/studio/map-preview"
import { LayerList } from "@/components/studio/layer-list"
import { PropertyPanel } from "@/components/studio/property-panel"
import { SourcePanel } from "@/components/studio/source-panel"
import { StyleSettingsPanel } from "@/components/studio/style-settings-panel"
import { JsonEditor } from "@/components/studio/json-editor"
import { Separator } from "@planisfy/ui/components/separator"
import { Button } from "@planisfy/ui/components/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@planisfy/ui/components/tabs"
import { ValidationPanel } from "@/components/studio/validation-panel"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@planisfy/ui/components/popover"
import { Input } from "@planisfy/ui/components/input"
import {
  Download,
  Upload,
  Undo2,
  Redo2,
  Code2,
  MousePointerClick,
  AlertTriangle,
  ClipboardCopy,
  Link,
  Check,
  Settings,
} from "lucide-react"

export default function StyleEditorPage() {
  const loadStyle = useStyleStore((s) => s.loadStyle)
  const style = useStyleStore((s) => s.style)
  const styleName = useStyleStore((s) => s.style?.name)
  const updateStyleName = useStyleStore((s) => s.updateStyleName)
  const selectedLayerId = useStyleStore((s) => s.selectedLayerId)
  const deleteLayer = useStyleStore((s) => s.deleteLayer)
  const duplicateLayer = useStyleStore((s) => s.duplicateLayer)
  const undo = useStyleStore((s) => s.undo)
  const redo = useStyleStore((s) => s.redo)
  const canUndo = useStyleStore((s) => s.canUndo)
  const canRedo = useStyleStore((s) => s.canRedo)
  const [showJson, setShowJson] = useState(false)
  const [inspectMode, setInspectMode] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [copied, setCopied] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [urlLoading, setUrlLoading] = useState(false)

  const searchParams = useSearchParams()

  // Load style from URL param or use sample
  useEffect(() => {
    const styleUrl = searchParams.get("url")
    if (styleUrl) {
      fetch(styleUrl)
        .then((r) => r.json())
        .then((json) => {
          if (json.version === 8 && Array.isArray(json.layers)) {
            loadStyle(json)
          } else {
            loadStyle(sampleStyle)
          }
        })
        .catch(() => loadStyle(sampleStyle))
    } else {
      loadStyle(sampleStyle)
    }
  }, [searchParams, loadStyle])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

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
      // Cmd+D — duplicate selected layer
      if (mod && e.key === "d" && selectedLayerId) {
        e.preventDefault()
        duplicateLayer(selectedLayerId)
        return
      }
      // Delete — remove selected layer (only when not in an input)
      if (e.key === "Delete" && selectedLayerId && !isInput) {
        e.preventDefault()
        deleteLayer(selectedLayerId)
        return
      }
    },
    [undo, redo, selectedLayerId, deleteLayer, duplicateLayer]
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

  const handleCopyToClipboard = async () => {
    if (!style) return
    await navigator.clipboard.writeText(JSON.stringify(style, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  const handleLoadFromUrl = async () => {
    if (!urlInput.trim()) return
    setUrlLoading(true)
    try {
      const r = await fetch(urlInput.trim())
      const json = await r.json()
      if (json.version === 8 && Array.isArray(json.layers)) {
        loadStyle(json)
      }
    } catch {
      // Invalid URL or style
    } finally {
      setUrlLoading(false)
    }
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
          variant={inspectMode ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setInspectMode(!inspectMode)}
          title="Toggle inspect mode"
        >
          <MousePointerClick className="h-3 w-3" />
          Inspect
        </Button>
        <Button
          variant={showValidation ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowValidation(!showValidation)}
          title="Toggle validation panel"
        >
          <AlertTriangle className="h-3 w-3" />
          Validate
        </Button>
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

        {/* Open from URL */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" title="Open style from URL">
              <Link className="h-3 w-3" />
              URL
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="end">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Load a MapLibre style from a URL</p>
              <div className="flex gap-1">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/style.json"
                  className="h-7 text-xs flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleLoadFromUrl()}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleLoadFromUrl}
                  disabled={urlLoading}
                >
                  {urlLoading ? "..." : "Load"}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleImport}>
          <Upload className="h-3 w-3" />
          Import
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleExport}>
          <Download className="h-3 w-3" />
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleCopyToClipboard}
          title="Copy style JSON to clipboard"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <ClipboardCopy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </header>

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Layers + Sources + Settings */}
        <aside className="flex w-60 flex-col border-r bg-background">
          <Tabs defaultValue="layers" className="flex flex-1 flex-col">
            <TabsList className="mx-2 mt-1 h-7">
              <TabsTrigger value="layers" className="text-xs h-6">
                Layers ({style.layers.length})
              </TabsTrigger>
              <TabsTrigger value="sources" className="text-xs h-6">
                Sources ({Object.keys(style.sources).length})
              </TabsTrigger>
              <TabsTrigger value="settings" className="text-xs h-6">
                <Settings className="h-3 w-3" />
              </TabsTrigger>
            </TabsList>
            <TabsContent value="layers" className="flex-1 overflow-hidden mt-0">
              <LayerList />
            </TabsContent>
            <TabsContent value="sources" className="flex-1 overflow-hidden mt-0">
              <SourcePanel />
            </TabsContent>
            <TabsContent value="settings" className="flex-1 overflow-hidden mt-0">
              <StyleSettingsPanel />
            </TabsContent>
          </Tabs>
        </aside>

        {/* Map + optional JSON/Validation panel */}
        <main className="flex flex-1 flex-col">
          <div className={showJson || showValidation ? "flex-1 basis-1/2" : "flex-1"}>
            <MapPreview inspectMode={inspectMode} />
          </div>
          {(showJson || showValidation) && (
            <div className="basis-1/2 border-t flex">
              {showJson && (
                <div className={showValidation ? "flex-1 border-r" : "flex-1"}>
                  <JsonEditor />
                </div>
              )}
              {showValidation && (
                <div className={showJson ? "w-72" : "flex-1"}>
                  <ValidationPanel />
                </div>
              )}
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
