"use client"

import { useStyleStore } from "@/lib/store/style-store"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@planisfy/ui/components/button"
import { Check, AlertTriangle } from "lucide-react"
import Editor, { type OnMount } from "@monaco-editor/react"
import { useTheme } from "next-themes"
import { validateMapLibreStyle } from "@planisfy/style-spec"

/**
 * Full style JSON editor using Monaco (VS Code engine).
 * Applies changes on Ctrl+Enter or "Apply" button.
 */
export function JsonEditor() {
  const style = useStyleStore((s) => s.style)
  const loadStyle = useStyleStore((s) => s.loadStyle)
  const { resolvedTheme } = useTheme()
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const externalUpdate = useRef(false)

  // Serialize style for the editor
  const styleJson = style ? JSON.stringify(style, null, 2) : ""

  // Sync store → editor when style changes externally
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !style) return
    const currentValue = editor.getValue()
    const newValue = JSON.stringify(style, null, 2)
    // Only update if the change came from outside the editor
    if (currentValue !== newValue && !dirty) {
      externalUpdate.current = true
      editor.setValue(newValue)
      externalUpdate.current = false
    }
  }, [style, dirty])

  const validate = useCallback((value: string) => {
    try {
      const parsed = JSON.parse(value)
      const issues = validateMapLibreStyle(parsed)
      if (issues.length > 0) {
        setError(issues[0]?.message ?? "Invalid MapLibre style")
        return false
      }
      setError(null)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }, [])

  const applyChanges = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const value = editor.getValue()
    try {
      const parsed = JSON.parse(value)
      if (validate(value)) {
        loadStyle(parsed)
        setDirty(false)
        setError(null)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }, [loadStyle, validate])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor

    // Configure JSON defaults
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      trailingCommas: "error",
    })

    // Ctrl+Enter to apply
    editor.addAction({
      id: "apply-style",
      label: "Apply Style Changes",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => applyChanges(),
    })
  }

  const handleChange = (value: string | undefined) => {
    if (externalUpdate.current || !value) return
    setDirty(true)
    validate(value)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        {error ? (
          <div className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        ) : dirty ? (
          <span className="text-xs text-muted-foreground">
            Modified — Ctrl+Enter to apply
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Style JSON</span>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-6 gap-1 text-xs"
          onClick={applyChanges}
          disabled={!!error || !dirty}
        >
          <Check className="h-3 w-3" />
          Apply
        </Button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          defaultLanguage="json"
          defaultValue={styleJson}
          theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
          onMount={handleMount}
          onChange={handleChange}
          options={{
            minimap: { enabled: true },
            fontSize: 12,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            formatOnPaste: true,
            bracketPairColorization: { enabled: true },
            folding: true,
            renderLineHighlight: "gutter",
          }}
        />
      </div>
    </div>
  )
}
