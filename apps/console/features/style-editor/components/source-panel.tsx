"use client";

import { useEffect, useState } from "react";
import {
  useStyleStore,
  type SourceLayerOptions,
} from "@/features/style-editor/store/style-store";
import { api, type ConsoleTileset } from "@/lib/api";
import { ScrollArea } from "@planisfy/ui/components/scroll-area";
import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import { Badge } from "@planisfy/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import { Plus, Trash2, Database, Layers, RefreshCw } from "lucide-react";
import { SOURCE_TYPES, type SourceType } from "@/features/style-editor/style-spec/source";
import type { SourceSpecification } from "maplibre-gl";
import { clientEnv } from "@/env.client";
import {
  isManagedDeploymentMode,
  managedPlatformSources,
} from "@/lib/managed-defaults";
import {
  defaultLayerOptionsForTileset,
  defaultLayerType,
  inferLayerType,
  layerTypesForSource,
  publishabilityMessage,
  styleSourceIdForTileset,
  tilesetToStyleSource,
  vectorLayersForTileset,
} from "@/features/tilesets/workflow/source-workflow";

export function SourcePanel() {
  const style = useStyleStore((s) => s.style);
  const addSource = useStyleStore((s) => s.addSource);
  const updateSource = useStyleStore((s) => s.updateSource);
  const deleteSource = useStyleStore((s) => s.deleteSource);
  const addLayerFromSource = useStyleStore((s) => s.addLayerFromSource);
  const [showAdd, setShowAdd] = useState(false);

  if (!style) return null;

  const sources = Object.entries(style.sources);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        <SourceBrowser
          existingSourceIds={new Set(Object.keys(style.sources))}
          onAdd={(id, source) => addSource(id, source)}
          onAddLayer={(sourceId, options) =>
            addLayerFromSource(sourceId, options)
          }
        />

        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Style sources ({sources.length})
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={() => setShowAdd(!showAdd)}
          >
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>

        {showAdd && (
          <AddSourceForm
            onAdd={(id, source) => {
              addSource(id, source);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {sources.map(([id, source]) => (
          <SourceItem
            key={id}
            sourceId={id}
            source={source as SourceSpecification}
            onUpdate={(s) => updateSource(id, s)}
            onDelete={() => deleteSource(id)}
            onAddLayer={(options) => addLayerFromSource(id, options)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function SourceBrowser({
  existingSourceIds,
  onAdd,
  onAddLayer,
}: {
  existingSourceIds: Set<string>;
  onAdd: (id: string, source: SourceSpecification) => void;
  onAddLayer: (sourceId: string, options?: SourceLayerOptions) => void;
}) {
  const [tilesets, setTilesets] = useState<ConsoleTileset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSourceLayers, setSelectedSourceLayers] = useState<
    Record<string, string>
  >({});
  const [selectedPlatformLayers, setSelectedPlatformLayers] = useState<
    Record<string, string>
  >({});
  const platformSources = isManagedDeploymentMode(
    clientEnv.NEXT_PUBLIC_DEPLOYMENT_MODE,
  )
    ? managedPlatformSources(clientEnv.NEXT_PUBLIC_API_URL)
    : [];

  useEffect(() => {
    let active = true;

    api
      .listTilesets()
      .then(({ data }) => {
        if (!active) return;
        setTilesets(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to load tilesets",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rounded border bg-muted/20 p-2 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Source browser
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Add managed platform sources or ready tilesets to this draft style.
          </p>
        </div>
        {loading && (
          <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {platformSources.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Platform sources
          </p>
          {platformSources.map((source) => {
            const inStyle = existingSourceIds.has(source.sourceId);
            const selectedSourceLayer =
              selectedPlatformLayers[source.id] ?? source.vectorLayers[0]?.id;
            return (
              <div
                key={source.id}
                className="rounded border bg-background p-2 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">
                      {source.name}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {source.sourceId}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {source.description}
                    </div>
                  </div>
                  <Badge variant="success" className="text-[10px]">
                    MANAGED
                  </Badge>
                </div>
                {source.vectorLayers.length > 1 && (
                  <Select
                    value={selectedSourceLayer}
                    onValueChange={(value) =>
                      setSelectedPlatformLayers((current) => ({
                        ...current,
                        [source.id]: value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-6 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {source.vectorLayers.map((layer) => (
                        <SelectItem
                          key={layer.id}
                          value={layer.id}
                          className="text-xs"
                        >
                          {layer.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 flex-1 gap-1 text-xs"
                    disabled={inStyle}
                    onClick={() => onAdd(source.sourceId, source.source)}
                  >
                    <Database className="h-3 w-3" />
                    {inStyle ? "Added" : "Source"}
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 flex-1 gap-1 text-xs"
                    onClick={() => {
                      if (!inStyle) onAdd(source.sourceId, source.source);
                      onAddLayer(source.sourceId, {
                        layerType: inferLayerType(selectedSourceLayer),
                        sourceLayer: selectedSourceLayer,
                      });
                    }}
                  >
                    <Layers className="h-3 w-3" /> Layer
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : tilesets.length === 0 && !loading ? (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Uploaded tilesets
          </p>
          <p className="text-[11px] text-muted-foreground">
            No uploaded tilesets yet.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Uploaded tilesets
          </p>
          {tilesets.slice(0, 8).map((tileset) => {
            const sourceId = styleSourceIdForTileset(tileset);
            const inStyle = existingSourceIds.has(sourceId);
            const spec = tilesetToStyleSource(tileset);
            const canAdd = Boolean(spec && tileset.isPublished);
            const vectorLayers = vectorLayersForTileset(tileset);
            const selectedSourceLayer =
              selectedSourceLayers[tileset.id] ?? vectorLayers[0]?.id;
            return (
              <div
                key={tileset.id}
                className="rounded border bg-background p-2 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">
                      {tileset.name}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {tileset.ownerHandle
                        ? `${tileset.ownerHandle}.${tileset.handle}`
                        : tileset.handle}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {canAdd ? sourceId : publishabilityMessage(tileset)}
                    </div>
                  </div>
                  <Badge
                    variant={tileset.isPublished ? "success" : "secondary"}
                    className="text-[10px]"
                  >
                    {tileset.isPublished ? "PUBLISHED" : tileset.status}
                  </Badge>
                </div>
                {vectorLayers.length > 1 && (
                  <Select
                    value={selectedSourceLayer}
                    onValueChange={(value) =>
                      setSelectedSourceLayers((current) => ({
                        ...current,
                        [tileset.id]: value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-6 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vectorLayers.map((layer) => (
                        <SelectItem
                          key={layer.id}
                          value={layer.id}
                          className="text-xs"
                        >
                          {layer.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 flex-1 gap-1 text-xs"
                    disabled={!canAdd || inStyle}
                    onClick={() => spec && onAdd(sourceId, spec)}
                  >
                    <Database className="h-3 w-3" />
                    {inStyle ? "Added" : "Source"}
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 flex-1 gap-1 text-xs"
                    disabled={!canAdd}
                    onClick={() => {
                      if (!spec) return;
                      if (!inStyle) onAdd(sourceId, spec);
                      onAddLayer(
                        sourceId,
                        defaultLayerOptionsForTileset(
                          tileset,
                          selectedSourceLayer,
                        ),
                      );
                    }}
                  >
                    <Layers className="h-3 w-3" /> Layer
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SourceItem({
  sourceId,
  source,
  onUpdate,
  onDelete,
  onAddLayer,
}: {
  sourceId: string;
  source: SourceSpecification;
  onUpdate: (source: SourceSpecification) => void;
  onDelete: () => void;
  onAddLayer: (options?: SourceLayerOptions) => void;
}) {
  const [layerType, setLayerType] = useState<
    NonNullable<SourceLayerOptions["layerType"]>
  >(defaultLayerType(source));
  const [sourceLayer, setSourceLayer] = useState("");

  return (
    <div className="rounded border p-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          <Database className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">{sourceId}</span>
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
            {source.type}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="rounded bg-muted/30 p-1.5 space-y-1">
        <Label className="text-[10px] text-muted-foreground">
          Create layer
        </Label>
        <div className="flex gap-1">
          <Select
            value={layerType}
            onValueChange={(v) =>
              setLayerType(v as NonNullable<SourceLayerOptions["layerType"]>)
            }
          >
            <SelectTrigger className="h-6 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {layerTypesForSource(source).map((type) => (
                <SelectItem key={type} value={type} className="text-xs">
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-6 text-xs"
            onClick={() =>
              onAddLayer({ layerType, sourceLayer: sourceLayer || undefined })
            }
          >
            <Plus className="h-3 w-3 mr-1" /> Layer
          </Button>
        </div>
        {source.type === "vector" && (
          <Input
            value={sourceLayer}
            onChange={(e) => setSourceLayer(e.target.value)}
            className="h-6 text-xs font-mono"
            placeholder="source-layer (optional)"
          />
        )}
      </div>

      {source.type === "vector" && "url" in source && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">URL</Label>
          <Input
            value={(source as { url?: string }).url ?? ""}
            onChange={(e) =>
              onUpdate({
                ...source,
                url: e.target.value,
              } as SourceSpecification)
            }
            className="h-6 text-xs font-mono"
            placeholder="https://tiles.example.com/data"
          />
        </div>
      )}

      {source.type === "geojson" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            Data URL or inline
          </Label>
          <Input
            value={
              typeof (source as { data?: unknown }).data === "string"
                ? String((source as { data?: unknown }).data)
                : ""
            }
            onChange={(e) =>
              onUpdate({
                ...source,
                data: e.target.value,
              } as SourceSpecification)
            }
            className="h-6 text-xs font-mono"
            placeholder="https://example.com/data.geojson"
          />
        </div>
      )}

      {(source.type === "raster" || source.type === "raster-dem") &&
        "url" in source && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              TileJSON URL
            </Label>
            <Input
              value={(source as { url?: string }).url ?? ""}
              onChange={(e) =>
                onUpdate({
                  ...source,
                  url: e.target.value,
                } as SourceSpecification)
              }
              className="h-6 text-xs font-mono"
            />
          </div>
        )}
    </div>
  );
}

function AddSourceForm({
  onAdd,
  onCancel,
}: {
  onAdd: (id: string, source: SourceSpecification) => void;
  onCancel: () => void;
}) {
  const [sourceId, setSourceId] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("vector");
  const [url, setUrl] = useState("");

  const handleAdd = () => {
    if (!sourceId.trim()) return;
    onAdd(sourceId, buildSource(sourceType, url));
  };

  return (
    <div className="rounded border bg-muted/30 p-2 space-y-2">
      <div className="space-y-1">
        <Label className="text-[10px]">Source ID</Label>
        <Input
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="h-6 text-xs"
          placeholder="my-source"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Type</Label>
        <Select
          value={sourceType}
          onValueChange={(v) => setSourceType(v as SourceType)}
        >
          <SelectTrigger className="h-6 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-6 text-xs font-mono"
          placeholder="https://..."
        />
      </div>
      <div className="flex gap-1">
        <Button size="sm" className="h-6 text-xs flex-1" onClick={handleAdd}>
          Add
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function buildSource(sourceType: SourceType, url: string): SourceSpecification {
  switch (sourceType) {
    case "vector":
      return { type: "vector", url } as SourceSpecification;
    case "raster":
      return {
        type: "raster",
        tiles: url ? [url] : [],
        tileSize: 256,
      } as SourceSpecification;
    case "raster-dem":
      return { type: "raster-dem", url, tileSize: 256 } as SourceSpecification;
    case "geojson":
      return {
        type: "geojson",
        data: url || { type: "FeatureCollection", features: [] },
      } as SourceSpecification;
    case "image":
      return {
        type: "image",
        url,
        coordinates: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      } as SourceSpecification;
    case "video":
      return {
        type: "video",
        urls: url ? [url] : [],
        coordinates: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      } as SourceSpecification;
  }
}
