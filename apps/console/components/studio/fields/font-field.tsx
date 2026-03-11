"use client"

import { Label } from "@planisfy/ui/components/label"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import { ScrollArea } from "@planisfy/ui/components/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@planisfy/ui/components/popover"
import { Plus, X, Type } from "lucide-react"
import { useState, useEffect } from "react"

// Common MapLibre fonts available from most glyph servers
const COMMON_FONTS = [
  "Open Sans Regular",
  "Open Sans Bold",
  "Open Sans Italic",
  "Open Sans Semibold",
  "Open Sans Light",
  "Noto Sans Regular",
  "Noto Sans Bold",
  "Noto Sans Italic",
  "Roboto Regular",
  "Roboto Bold",
  "Roboto Medium",
  "Metropolis Regular",
  "Metropolis Bold",
  "Klokantech Noto Sans Regular",
  "Klokantech Noto Sans Bold",
  "Klokantech Noto Sans Italic",
]

interface FontFieldProps {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  glyphsUrl?: string
}

/**
 * Font stack picker with common font suggestions.
 */
export function FontField({ label, value, onChange, glyphsUrl }: FontFieldProps) {
  const [availableFonts, setAvailableFonts] = useState<string[]>(COMMON_FONTS)
  const [filter, setFilter] = useState("")
  const fonts = Array.isArray(value) ? value : []

  // Try to fetch available fonts from the glyphs endpoint
  useEffect(() => {
    if (!glyphsUrl) return
    // Most glyph servers don't have a metadata endpoint, so we use common fonts
    // If we had a font metadata endpoint, we'd fetch it here
  }, [glyphsUrl])

  const addFont = (font: string) => {
    if (!fonts.includes(font)) {
      onChange([...fonts, font])
    }
  }

  const removeFont = (index: number) => {
    onChange(fonts.filter((_, i) => i !== index))
  }

  const updateFont = (index: number, newFont: string) => {
    const updated = [...fonts]
    updated[index] = newFont
    onChange(updated)
  }

  const filteredFonts = availableFonts.filter(
    (f) =>
      f.toLowerCase().includes(filter.toLowerCase()) && !fonts.includes(f)
  )

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>

      {/* Current font stack */}
      {fonts.map((font, i) => (
        <div key={i} className="flex items-center gap-1">
          <Type className="h-3 w-3 shrink-0 text-muted-foreground" />
          <Input
            value={font}
            onChange={(e) => updateFont(i, e.target.value)}
            className="h-6 text-xs flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={() => removeFont(i)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {/* Add font dropdown */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 text-xs gap-1">
            <Plus className="h-3 w-3" /> Add font
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <Input
            placeholder="Search fonts..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 text-xs mb-2"
          />
          <ScrollArea className="h-40">
            <div className="flex flex-col">
              {filteredFonts.map((font) => (
                <button
                  key={font}
                  className="rounded px-2 py-1 text-left text-xs hover:bg-accent"
                  onClick={() => addFont(font)}
                >
                  {font}
                </button>
              ))}
              {filteredFonts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No matching fonts
                </p>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  )
}
