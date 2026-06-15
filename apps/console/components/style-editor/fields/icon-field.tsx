"use client";

import { Label } from "@planisfy/ui/components/label";
import { Input } from "@planisfy/ui/components/input";
import { ScrollArea } from "@planisfy/ui/components/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@planisfy/ui/components/popover";
import { useState, useEffect, useMemo } from "react";
import { Image } from "lucide-react";

interface SpriteMetadata {
  [name: string]: {
    width: number;
    height: number;
    x: number;
    y: number;
    pixelRatio: number;
  };
}

interface IconFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  spriteUrl?: string;
}

/**
 * Icon/pattern picker — fetches available sprites and shows a visual grid.
 */
export function IconField({
  label,
  value,
  onChange,
  spriteUrl,
}: IconFieldProps) {
  const [sprites, setSprites] = useState<SpriteMetadata | null>(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!spriteUrl || sprites) return;
    // Fetch sprite metadata JSON
    fetch(`${spriteUrl}.json`)
      .then((r) => r.json())
      .then((data) => setSprites(data as SpriteMetadata))
      .catch(() => setSprites(null));
  }, [spriteUrl, sprites]);

  const filteredSprites = useMemo(() => {
    if (!sprites) return [];
    const entries = Object.entries(sprites);
    if (!filter) return entries;
    return entries.filter(([name]) =>
      name.toLowerCase().includes(filter.toLowerCase()),
    );
  }, [sprites, filter]);

  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-accent min-w-0">
            <Image className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono">{value || "none"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Search icons..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 text-xs"
            />
            <Input
              placeholder="Type icon name..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-7 text-xs font-mono"
            />
            {sprites ? (
              <ScrollArea className="h-48">
                <div className="grid grid-cols-4 gap-1">
                  {filteredSprites.map(([name, meta]) => (
                    <button
                      key={name}
                      className={`flex flex-col items-center gap-0.5 rounded p-1 text-[9px] hover:bg-accent ${
                        name === value ? "bg-accent ring-1 ring-primary" : ""
                      }`}
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                      }}
                      title={name}
                    >
                      {spriteUrl ? (
                        <div
                          className="h-6 w-6"
                          style={{
                            backgroundImage: `url(${spriteUrl}.png)`,
                            backgroundPosition: `-${meta.x}px -${meta.y}px`,
                            backgroundSize: "auto",
                            width: Math.min(meta.width, 24),
                            height: Math.min(meta.height, 24),
                          }}
                        />
                      ) : (
                        <Image className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="truncate w-full text-center">
                        {name}
                      </span>
                    </button>
                  ))}
                </div>
                {filteredSprites.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No matching icons
                  </p>
                )}
              </ScrollArea>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                {spriteUrl
                  ? "Loading sprites..."
                  : "No sprite source configured"}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
