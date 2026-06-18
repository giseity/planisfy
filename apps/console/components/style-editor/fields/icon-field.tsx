"use client";

import { api, type ConsoleSpriteAsset } from "@/lib/api";
import { Label } from "@planisfy/ui/components/label";
import { Input } from "@planisfy/ui/components/input";
import { ScrollArea } from "@planisfy/ui/components/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@planisfy/ui/components/popover";
import { useState, useEffect, useMemo } from "react";
import { Image, Upload } from "lucide-react";
import { toast } from "sonner";

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
  const [spriteMetadata, setSpriteMetadata] = useState<{
    url: string;
    data: SpriteMetadata | null;
  } | null>(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [assetMetadata, setAssetMetadata] = useState<ConsoleSpriteAsset[] | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const sprites =
    spriteMetadata && spriteMetadata.url === spriteUrl
      ? spriteMetadata.data
      : null;

  useEffect(() => {
    if (!spriteUrl) return;

    let canceled = false;
    fetch(`${spriteUrl}.json`)
      .then((r) => r.json())
      .then((data) => {
        if (!canceled) {
          setSpriteMetadata({ url: spriteUrl, data: data as SpriteMetadata });
        }
      })
      .catch(() => {
        if (!canceled) setSpriteMetadata({ url: spriteUrl, data: null });
      });

    return () => {
      canceled = true;
    };
  }, [spriteUrl]);

  useEffect(() => {
    let canceled = false;
    api
      .getSpriteAssets()
      .then((res) => {
        if (!canceled) setAssetMetadata(res.data);
      })
      .catch(() => {
        if (!canceled) setAssetMetadata([]);
      });

    return () => {
      canceled = true;
    };
  }, []);

  const filteredSprites = useMemo(() => {
    const accountEntries =
      assetMetadata?.map((asset) => [
        asset.name,
        {
          width: asset.width,
          height: asset.height,
          x: 0,
          y: 0,
          pixelRatio: 1,
          previewUrl: asset.previewUrl,
        },
      ] as const) ?? [];
    const entries =
      accountEntries.length > 0 ? accountEntries : Object.entries(sprites ?? {});
    if (!filter) return entries;
    return entries.filter(([name]) =>
      name.toLowerCase().includes(filter.toLowerCase()),
    );
  }, [assetMetadata, sprites, filter]);

  async function uploadAsset(file: File | null) {
    if (!file) return;
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const name = baseName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 96);
    setUploading(true);
    try {
      const res = await api.uploadSpriteAsset({ name, file });
      setAssetMetadata((current) =>
        [...(current ?? []), res.data].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      onChange(res.data.name);
      toast.success("Sprite asset uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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
            <label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded border text-xs hover:bg-accent">
              <Upload className="h-3 w-3" />
              {uploading ? "Uploading..." : "Upload PNG"}
              <input
                type="file"
                accept="image/png"
                className="sr-only"
                disabled={uploading}
                onChange={(event) => {
                  void uploadAsset(event.currentTarget.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {assetMetadata || sprites ? (
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
                      {"previewUrl" in meta ? (
                        <div
                          className="h-6 w-6 bg-contain bg-center bg-no-repeat"
                          style={{ backgroundImage: `url(${meta.previewUrl})` }}
                        />
                      ) : spriteUrl ? (
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
