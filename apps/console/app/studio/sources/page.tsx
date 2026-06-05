"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError, type SourceProcessingStatus } from "@/lib/api";
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
  Trash2,
  RefreshCw,
  Database,
  Terminal,
  Copy,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface Source {
  id: string;
  name: string;
  handle: string;
  type: string;
  url: string;
  status: string;
  minZoom: number | null;
  maxZoom: number | null;
  bounds: unknown;
  createdAt: string;
  updatedAt: string;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadSourceId, setUploadSourceId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<
    Record<string, SourceProcessingStatus | null>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProcessing = useCallback(async (activeSources: Source[]) => {
    await Promise.all(
      activeSources.map(async (source) => {
        try {
          const res = await api.getSourceProcessing(source.id);
          setJobs((current) => ({ ...current, [source.id]: res.data }));
        } catch (err) {
          if (err instanceof ApiRequestError && err.status === 404) {
            setJobs((current) => ({ ...current, [source.id]: null }));
          }
        }
      }),
    );
  }, []);

  const fetchSources = useCallback(async () => {
    try {
      const data = await api.listSources();
      setSources(data);
      void fetchProcessing(
        data.filter(
          (source) =>
            source.status === "PENDING" || source.status === "PROCESSING",
        ),
      );
    } catch (err) {
      if (err instanceof Error) console.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchProcessing]);

  useEffect(() => {
    fetchSources();
    // Poll for status updates
    const interval = setInterval(fetchSources, 5000);
    return () => clearInterval(interval);
  }, [fetchSources]);

  async function handleCreate() {
    if (!newName || !newHandle) return;
    try {
      await api.post("/sources", { name: newName, handle: newHandle });
      setNewName("");
      setNewHandle("");
      setCreateOpen(false);
      toast.success("Source created");
      fetchSources();
    } catch {
      toast.error("Failed to create source");
    }
  }

  async function handleUpload(sourceId: string, file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.uploadSource(sourceId, formData);
      if (result.processingJobId) {
        setJobs((current) => ({
          ...current,
          [sourceId]: {
            id: result.processingJobId!,
            sourceId,
            uploadId: result.uploadId ?? null,
            status: result.status,
            progress: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            logs: [
              {
                id: `${result.processingJobId}-queued`,
                level: "info",
                message: result.message,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        }));
      }
      toast.success("File uploaded — processing started");
      fetchSources();
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
      setUploadSourceId(null);
    }
  }

  async function handleDelete(sourceId: string) {
    if (!confirm("Delete this source? This cannot be undone.")) return;
    try {
      await api.delete(`/sources/${sourceId}`);
      toast.success("Source deleted");
      fetchSources();
    } catch {
      toast.error("Failed to delete source");
    }
  }

  async function handleCopyUrl(source: Source) {
    await navigator.clipboard.writeText(source.url);
    toast.success("Tileset URL copied");
  }

  function progressForSource(source: Source) {
    if (source.status === "READY") return 100;
    return (
      jobs[source.id]?.progress ??
      (source.status === "PROCESSING"
        ? 50
        : source.status === "PENDING"
          ? 10
          : 0)
    );
  }

  function statusVariant(status: string) {
    switch (status) {
      case "READY":
        return "success" as const;
      case "PROCESSING":
        return "warning" as const;
      case "ERROR":
        return "destructive" as const;
      default:
        return "secondary" as const;
    }
  }

  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sources</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add source
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Source</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Dataset"
                />
              </div>
              <div className="space-y-2">
                <Label>Handle</Label>
                <Input
                  value={newHandle}
                  onChange={(e) =>
                    setNewHandle(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                    )
                  }
                  placeholder="my-dataset"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, hyphens, and underscores only
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newName || !newHandle}
                >
                  Create
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
              className="h-16 rounded-lg border bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Database className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No sources yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create a source and upload GeoJSON, CSV, or PMTiles data.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add source
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Handle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Zoom</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <Fragment key={source.id}>
                <TableRow>
                  <TableCell className="font-medium">{source.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {source.handle}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {source.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(source.status)}>
                      {source.status === "PROCESSING" && (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      )}
                      {source.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {source.minZoom ?? 0}-{source.maxZoom ?? 22}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(source.updatedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUploadSourceId(source.id);
                          fileInputRef.current?.click();
                        }}
                        disabled={source.status === "PROCESSING" || uploading}
                        title="Upload data"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyUrl(source)}
                        disabled={!source.url}
                        title="Copy tileset URL"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(
                            source.url,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                        disabled={!source.url}
                        title="Open tileset URL"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(source.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {(source.status === "PENDING" ||
                  source.status === "PROCESSING" ||
                  jobs[source.id]) && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/20">
                      <UploadProgress
                        source={source}
                        job={jobs[source.id]}
                        progress={progressForSource(source)}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".geojson,.json,.csv,.pmtiles"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadSourceId) {
            handleUpload(uploadSourceId, file);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}

function UploadProgress({
  source,
  job,
  progress,
}: {
  source: Source;
  job: SourceProcessingStatus | null | undefined;
  progress: number;
}) {
  const logs = job?.logs ?? [];

  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Upload processing</span>
        <span className="text-muted-foreground">{progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Status: {job?.status ?? source.status}</span>
        {job?.uploadId && <span>Upload: {job.uploadId}</span>}
        {job?.id && <span>Job: {job.id}</span>}
        {job?.errorMessage && (
          <span className="text-destructive">{job.errorMessage}</span>
        )}
      </div>
      <div className="rounded border bg-background p-2">
        <div className="mb-1 flex items-center gap-1 text-xs font-medium">
          <Terminal className="h-3 w-3" /> Logs
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Waiting for processing logs from /sources/{source.id}/processing.
          </p>
        ) : (
          <div className="max-h-24 space-y-1 overflow-auto font-mono text-[11px]">
            {logs.map((log) => (
              <div
                key={log.id}
                className={
                  log.level === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {new Date(log.createdAt).toLocaleTimeString()} [{log.level}]{" "}
                {log.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
