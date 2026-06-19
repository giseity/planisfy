"use client";

import { useMemo } from "react";
import { useStyleStore } from "@/features/style-editor/store/style-store";
import { validateStyleJSON, type StyleError } from "@/features/style-editor/style-spec";
import { ScrollArea } from "@planisfy/ui/components/scroll-area";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function ValidationPanel() {
  const style = useStyleStore((s) => s.style);
  const setSelectedLayer = useStyleStore((s) => s.setSelectedLayer);

  const errors = useMemo<StyleError[]>(() => {
    if (!style) return [];
    return validateStyleJSON(style);
  }, [style]);

  if (!style) return null;

  if (errors.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        Style is valid
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {errors.length} validation {errors.length === 1 ? "error" : "errors"}
        </div>
        {errors.map((error, i) => {
          const layerMatch = error.message.match(/layers\[(\d+)\]/);
          const layerIndex = layerMatch ? parseInt(layerMatch[1]!) : null;
          const layer = layerIndex !== null ? style.layers[layerIndex] : null;

          return (
            <button
              key={i}
              className="flex flex-col gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              onClick={() => {
                if (layer) setSelectedLayer(layer.id);
              }}
            >
              <span className="text-foreground">{error.message}</span>
              {layer && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  → {layer.id}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
