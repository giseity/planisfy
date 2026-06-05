"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  api,
  type ConsoleTileset,
  type ConsoleTilesetVersion,
} from "@/lib/api";
import { Badge } from "@planisfy/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@planisfy/ui/components/dialog";
import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import {
  Plus,
  Upload,
  RefreshCw,
  Database,
  Copy,
  ExternalLink,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

export default function SourcesPage() {
  const [tilesets, setTilesets] = useState<ConsoleTileset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [description, setDescription] = useState("");
  const [minZoom, setMinZoom] = useState(0);
  const [maxZoom, setMaxZoom] = useState(14);
  const [csvLatitude, setCsvLatitude] = useState("");
  const [csvLongitude, setCsvLongitude] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(
    null,
  );

  const fetchTilesets = useCallback(async () => {
    try {
      const { data } = await api.listTilesets();
      setTilesets(data);
    } catch (err) {
      if (err instanceof Error) console.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTilesets();
    const interval = setInterval(fetchTilesets, 5000);
    return () => clearInterval(interval);
  }, [fetchTilesets]);

  async function handleUpload() {
    if (!newName || !newHandle || !file) return;
    setUploading(true);
    try {
      await api.uploadTileset(file, {
        name: newName,
        handle: newHandle,
        description: description || undefined,
        minZoom,
        maxZoom,
        csvLatitude: csvLatitude || undefined,
        csvLongitude: csvLongitude || undefined,
      });
      resetUploadForm();
      setUploadOpen(false);
      toast.success("Tileset upload queued");
      fetchTilesets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

  async function handlePublish(tileset: ConsoleTileset) {
    const version = tileset.latestVersion;
    if (!version) return;

    setPublishingVersionId(version.id);
    try {
      await api.publishTilesetVersion(tileset.id, version.version);
      toast.success(`Published ${tileset.handle} v${version.version}`);
      fetchTilesets();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to publish tileset",
      );
    } finally {
      setPublishingVersionId(null);
    }
  }

  async function handleCopyUrl(tileset: ConsoleTileset) {
    if (!tileset.tilejsonUrl) return;
    await navigator.clipboard.writeText(tileset.tilejsonUrl);
    toast.success("TileJSON URL copied");
  }

  function resetUploadForm() {
    setNewName("");
    setNewHandle("");
    setDescription("");
    setMinZoom(0);
    setMaxZoom(14);
    setCsvLatitude("");
    setCsvLongitude("");
    setFile(null);
  }

  return (
    <div className="container max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tilesets</h1>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Upload tileset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload tileset</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Transit stops"
                />
              </div>
              <div className="space-y-2">
                <Label>Handle</Label>
                <Input
                  value={newHandle}
                  onChange={(e) =>
                    setNewHandle(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  placeholder="transit-stops"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens only.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Min zoom</Label>
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    value={minZoom}
                    onChange={(e) => setMinZoom(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max zoom</Label>
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    value={maxZoom}
                    onChange={(e) => setMaxZoom(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CSV latitude</Label>
                  <Input
                    value={csvLatitude}
                    onChange={(e) => setCsvLatitude(e.target.value)}
                    placeholder="lat"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CSV longitude</Label>
                  <Input
                    value={csvLongitude}
                    onChange={(e) => setCsvLongitude(e.target.value)}
                    placeholder="lon"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>File</Label>
                <Input
                  type="file"
                  accept=".geojson,.json,.csv,.zip,.pmtiles,.mbtiles"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  GeoJSON, CSV, zipped Shapefile, PMTiles, or MBTiles.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetUploadForm();
                    setUploadOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!newName || !newHandle || !file || uploading}
                >
                  {uploading ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg border bg-muted"
            />
          ))}
        </div>
      ) : tilesets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Database className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">No tilesets yet</h3>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Upload a data file to create a versioned tileset.
          </p>
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Upload tileset
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Handle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Layers</TableHead>
              <TableHead>Zoom</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tilesets.map((tileset) => {
              const displayVersion =
                tileset.currentVersion ?? tileset.latestVersion;
              const canPublish = Boolean(
                tileset.latestVersion &&
                  tileset.latestVersion.id !== tileset.currentVersion?.id,
              );
              return (
                <Fragment key={tileset.id}>
                  <TableRow>
                    <TableCell className="font-medium">
                      {tileset.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {tileset.ownerHandle
                        ? `${tileset.ownerHandle}.${tileset.handle}`
                        : tileset.handle}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(tileset.status)}>
                        {tileset.status === "BUILDING" && (
                          <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        {tileset.isPublished ? "PUBLISHED" : tileset.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {displayVersion ? `v${displayVersion.version}` : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {vectorLayerCount(displayVersion)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tileset.minZoom ?? 0}-{tileset.maxZoom ?? 14}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(tileset.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePublish(tileset)}
                          disabled={
                            !canPublish ||
                            publishingVersionId === tileset.latestVersion?.id
                          }
                          title="Publish latest version"
                        >
                          {publishingVersionId === tileset.latestVersion?.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Globe className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyUrl(tileset)}
                          disabled={!tileset.tilejsonUrl}
                          title="Copy TileJSON URL"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            tileset.tilejsonUrl &&
                            window.open(
                              tileset.tilejsonUrl,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                          disabled={!tileset.tilejsonUrl}
                          title="Open TileJSON URL"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {tileset.status === "BUILDING" && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/20">
                        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Upload validation and tile generation are running.
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function statusVariant(status: string) {
  switch (status) {
    case "READY":
      return "success" as const;
    case "BUILDING":
      return "warning" as const;
    case "ERROR":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function vectorLayerCount(version: ConsoleTilesetVersion | null) {
  return version?.schema?.vector_layers?.length ?? 0;
}
