"use client";

import { FileDropzone } from "@/components/file-upload/file-dropzone";
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
import { FolderOpen, Image, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

const SPRITE_ACCEPT = "image/png,image/svg+xml";
const SPRITE_ACCEPTED_LABEL = "PNG or SVG";
const MAX_SPRITE_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

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

interface PickerSprite {
  width: number;
  height: number;
  x: number;
  y: number;
  pixelRatio: number;
  previewUrl?: string;
  folder?: string;
  sourceFormat?: string;
  tags?: string[];
  description?: string | null;
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
  const [folderFilter, setFolderFilter] = useState("");
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [open, setOpen] = useState(false);
  const [assetMetadata, setAssetMetadata] = useState<
    ConsoleSpriteAsset[] | null
  >(null);
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

  const folders = useMemo(
    () =>
      [
        ...new Set(
          (assetMetadata ?? [])
            .map((asset) => asset.folder)
            .filter((folder) => folder.length > 0),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [assetMetadata],
  );

  const filteredSprites = useMemo(() => {
    const accountEntries: Array<readonly [string, PickerSprite]> =
      assetMetadata?.map(
        (asset) =>
          [
            asset.name,
            {
              width: asset.width,
              height: asset.height,
              x: 0,
              y: 0,
              pixelRatio: 1,
              previewUrl: asset.previewUrl,
              folder: asset.folder,
              sourceFormat: asset.sourceFormat,
              tags: asset.tags,
              description: asset.description,
            },
          ] as const,
      ) ?? [];
    const spriteEntries: Array<readonly [string, PickerSprite]> =
      Object.entries(sprites ?? {}).map(
        ([name, meta]) => [name, meta] as const,
      );
    const entries = accountEntries.length > 0 ? accountEntries : spriteEntries;
    const query = filter.trim().toLowerCase();
    return entries.filter(([name, meta]) => {
      const folderMatch = !folderFilter || meta.folder === folderFilter;
      if (!folderMatch) return false;
      if (!query) return true;
      return [
        name,
        meta.folder,
        meta.sourceFormat,
        meta.description,
        ...(meta.tags ?? []),
      ]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(query));
    });
  }, [assetMetadata, sprites, filter, folderFilter]);

  async function uploadAsset(file: File | null) {
    if (!file) return;
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const name = baseName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 96);
    const tags = uploadTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    setUploading(true);
    try {
      const res = await api.uploadSpriteAsset({
        name,
        file,
        folder: uploadFolder.trim(),
        tags,
      });
      setAssetMetadata((current) =>
        [...(current ?? []), res.data].sort((a, b) =>
          `${a.folder}/${a.name}`.localeCompare(`${b.folder}/${b.name}`),
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

  async function deleteAsset(assetName: string) {
    const asset = assetMetadata?.find((item) => item.name === assetName);
    if (!asset) return;
    try {
      await api.deleteSpriteAsset(asset.id);
      setAssetMetadata((current) =>
        (current ?? []).filter((item) => item.id !== asset.id),
      );
      if (value === asset.name) onChange("");
      toast.success("Sprite asset deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
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
            {folders.length > 0 ? (
              <label className="flex items-center gap-1.5">
                <FolderOpen className="h-3 w-3 text-muted-foreground" />
                <select
                  value={folderFilter}
                  onChange={(e) => setFolderFilter(e.target.value)}
                  className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-xs"
                >
                  <option value="">All folders</option>
                  {folders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Input
              placeholder="Type icon name..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-7 text-xs font-mono"
            />
            <div className="grid grid-cols-2 gap-1">
              <Input
                placeholder="Folder"
                value={uploadFolder}
                onChange={(e) => setUploadFolder(e.target.value)}
                className="h-7 text-xs"
              />
              <Input
                placeholder="Tags"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <FileDropzone
              id="sprite-asset-upload-file"
              accept={SPRITE_ACCEPT}
              acceptedLabel={SPRITE_ACCEPTED_LABEL}
              maxSizeBytes={MAX_SPRITE_UPLOAD_SIZE_BYTES}
              title={uploading ? "Uploading..." : "Upload PNG/SVG"}
              description="Drop image or click to browse"
              emptyIcon={<Upload className="size-3.5 opacity-60" />}
              disabled={uploading}
              variant="compact"
              showSelectedFile={false}
              onFileAccepted={uploadAsset}
            />
            {assetMetadata || sprites ? (
              <ScrollArea className="h-48">
                <div className="grid grid-cols-4 gap-1">
                  {filteredSprites.map(([name, meta]) => (
                    <div key={name} className="group relative">
                      <button
                        className={`flex w-full flex-col items-center gap-0.5 rounded p-1 text-[9px] hover:bg-accent ${
                          name === value ? "bg-accent ring-1 ring-primary" : ""
                        }`}
                        onClick={() => {
                          onChange(name);
                          setOpen(false);
                        }}
                        title={[
                          name,
                          meta.folder,
                          meta.sourceFormat?.toUpperCase(),
                          ...(meta.tags ?? []),
                        ]
                          .filter(Boolean)
                          .join(" - ")}
                      >
                        {meta.previewUrl ? (
                          <div
                            className="h-6 w-6 bg-contain bg-center bg-no-repeat"
                            style={{
                              backgroundImage: `url(${meta.previewUrl})`,
                            }}
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
                        {meta.folder ? (
                          <span className="max-w-full truncate rounded bg-muted px-1 text-[8px] text-muted-foreground">
                            {meta.folder}
                          </span>
                        ) : null}
                        {meta.previewUrl ? (
                          <span className="rounded bg-muted px-1 text-[8px] uppercase text-muted-foreground">
                            {meta.sourceFormat ?? "png"}
                          </span>
                        ) : null}
                      </button>
                      {meta.previewUrl ? (
                        <button
                          type="button"
                          className="absolute right-0.5 top-0.5 hidden rounded bg-background/90 p-0.5 text-muted-foreground shadow-sm hover:text-destructive group-hover:block"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteAsset(name);
                          }}
                          title="Delete asset"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
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
