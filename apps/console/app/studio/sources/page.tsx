"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  api,
  type ApiEnvelope,
  type ConsoleExecutionTarget,
  type ConsoleProcessingJob,
  type ConsoleWorkerProfile,
  type ConsoleSourceImport,
  type ConsoleTileset,
  type ConsoleUploadValidation,
  type ConsoleTilesetVersion,
  type ProcessingEstimate,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import {
  Plus,
  Upload,
  RefreshCw,
  Database,
  Copy,
  ExternalLink,
  Globe,
  AlertCircle,
  RotateCcw,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { OvertureImportDialog } from "@/components/studio/overture-import-dialog";
import { SourceWorkflowGuide } from "@/components/studio/source-workflow-guide";
import {
  canRebuildTileset,
  tilesetVersionActionLabel,
} from "@/lib/studio/tileset-workflow";
import {
  canCreateTilesetFromImport,
  defaultTilesetOptionsForImport,
  sourceImportStatusVariant,
  sourceImportSummary,
} from "@/lib/studio/import-workflow";
import type { SourceWorkflowStyleSummary } from "@/lib/studio/source-workflow-guide";

export default function SourcesPage() {
  const [tilesets, setTilesets] = useState<ConsoleTileset[]>([]);
  const [jobs, setJobs] = useState<ConsoleProcessingJob[]>([]);
  const [sourceImports, setSourceImports] = useState<ConsoleSourceImport[]>([]);
  const [styles, setStyles] = useState<SourceWorkflowStyleSummary[]>([]);
  const [executionTargets, setExecutionTargets] = useState<ConsoleExecutionTarget[]>([]);
  const [workerProfiles, setWorkerProfiles] = useState<ConsoleWorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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
  const [controllingJobId, setControllingJobId] = useState<string | null>(null);
  const [rebuildingTilesetId, setRebuildingTilesetId] = useState<string | null>(
    null,
  );
  const [tilingImportId, setTilingImportId] = useState<string | null>(null);
  const [selectedExecutionTargetId, setSelectedExecutionTargetId] = useState("default");
  const [selectedWorkerProfileId, setSelectedWorkerProfileId] = useState("default");
  const [uploadEstimate, setUploadEstimate] = useState<ProcessingEstimate | null>(null);
  const [importEstimates, setImportEstimates] = useState<Record<string, ProcessingEstimate>>({});

  const fetchTilesets = useCallback(async () => {
    try {
      const [tilesetsRes, jobsRes, importsRes, stylesRes, targetsRes, profilesRes] = await Promise.all([
        api.listTilesets(),
        api.listJobs(),
        api.listSourceImports(),
        api.get<ApiEnvelope<SourceWorkflowStyleSummary[]>>("/styles"),
        api.listExecutionTargets(),
        api.listWorkerProfiles(),
      ]);
      setTilesets(tilesetsRes.data);
      setJobs(jobsRes.data);
      setSourceImports(importsRes.data);
      setStyles(stylesRes.data);
      setExecutionTargets(targetsRes.data);
      setWorkerProfiles(profilesRes.data);
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

  useEffect(() => {
    setImportEstimates({});
  }, [selectedExecutionTargetId, selectedWorkerProfileId]);

  useEffect(() => {
    if (!uploadOpen || !file) {
      setUploadEstimate(null);
      return;
    }
    let canceled = false;
    api
      .estimateProcessingJob({
        ...runtimeSelectionPayload(selectedExecutionTargetId, selectedWorkerProfileId),
        sourceSizeBytes: file.size,
        minZoom,
        maxZoom,
      })
      .then((res) => {
        if (!canceled) setUploadEstimate(res.data);
      })
      .catch(() => {
        if (!canceled) setUploadEstimate(null);
      });
    return () => {
      canceled = true;
    };
  }, [
    file,
    maxZoom,
    minZoom,
    selectedExecutionTargetId,
    selectedWorkerProfileId,
    uploadOpen,
  ]);

  useEffect(() => {
    const importsToEstimate = sourceImports.filter(
      (sourceImport) =>
        canCreateTilesetFromImport(sourceImport) &&
        typeof sourceImport.output?.featureCount === "number" &&
        !importEstimates[sourceImport.id],
    );
    if (importsToEstimate.length === 0) return;
    let canceled = false;
    Promise.all(
      importsToEstimate.map(async (sourceImport) => {
        const res = await api.estimateProcessingJob({
          ...runtimeSelectionPayload(selectedExecutionTargetId, selectedWorkerProfileId),
          featureCount: sourceImport.output?.featureCount,
          minZoom: 0,
          maxZoom: 14,
        });
        return [sourceImport.id, res.data] as const;
      }),
    )
      .then((entries) => {
        if (canceled) return;
        setImportEstimates((current) => ({ ...current, ...Object.fromEntries(entries) }));
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [
    importEstimates,
    selectedExecutionTargetId,
    selectedWorkerProfileId,
    sourceImports,
  ]);

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
        ...runtimeSelectionPayload(selectedExecutionTargetId, selectedWorkerProfileId),
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

  async function handlePublish(
    tileset: ConsoleTileset,
    version = tileset.latestVersion,
  ) {
    if (!version) return;

    setPublishingVersionId(version.id);
    try {
      await api.publishTilesetVersion(tileset.id, version.version);
      toast.success(`Promoted ${tileset.handle} v${version.version}`);
      fetchTilesets();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to promote tileset version",
      );
    } finally {
      setPublishingVersionId(null);
    }
  }

  async function handleRebuild(tileset: ConsoleTileset) {
    setRebuildingTilesetId(tileset.id);
    try {
      await api.rebuildTileset(tileset.id);
      toast.success("Tileset rebuild queued");
      fetchTilesets();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to rebuild tileset",
      );
    } finally {
      setRebuildingTilesetId(null);
    }
  }

  async function handleCreateTilesetFromImport(sourceImport: ConsoleSourceImport) {
    if (!sourceImport.datasetId || !sourceImport.output?.datasetVersionId) return;
    setTilingImportId(sourceImport.id);
    try {
      await api.createTilesetFromDataset(sourceImport.datasetId, {
        ...defaultTilesetOptionsForImport(sourceImport),
        datasetVersionId: sourceImport.output.datasetVersionId,
        ...runtimeSelectionPayload(selectedExecutionTargetId, selectedWorkerProfileId),
      });
      toast.success("Dataset tiling queued");
      fetchTilesets();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to queue dataset tiling",
      );
    } finally {
      setTilingImportId(null);
    }
  }

  async function handleRetryJob(job: ConsoleProcessingJob) {
    setControllingJobId(job.id);
    try {
      await api.retryJob(job.id);
      toast.success("Tileset build retry queued");
      fetchTilesets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retry job");
    } finally {
      setControllingJobId(null);
    }
  }

  async function handleCancelJob(job: ConsoleProcessingJob) {
    setControllingJobId(job.id);
    try {
      await api.cancelJob(job.id);
      toast.success(
        job.status === "PENDING"
          ? "Queued job canceled"
          : "Cancellation requested",
      );
      fetchTilesets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel job");
    } finally {
      setControllingJobId(null);
    }
  }

  async function handleCopyUrl(tileset: ConsoleTileset) {
    if (!tileset.tilejsonUrl) return;
    await navigator.clipboard.writeText(tileset.tilejsonUrl);
    toast.success("TileJSON URL copied");
  }

  async function handleCopyArtifactUrl(version: ConsoleTilesetVersion | null) {
    if (!version?.artifact?.url) return;
    await navigator.clipboard.writeText(version.artifact.url);
    toast.success("Artifact URL copied");
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
        <div className="flex items-center gap-2">
          <OvertureImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={fetchTilesets}
            trigger={
              <Button variant="outline">
                <Globe className="mr-2 h-4 w-4" />
                Import Overture
              </Button>
            }
          />
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
              <RuntimeSelectors
                executionTargets={executionTargets}
                workerProfiles={workerProfiles}
                selectedExecutionTargetId={selectedExecutionTargetId}
                selectedWorkerProfileId={selectedWorkerProfileId}
                onExecutionTargetChange={setSelectedExecutionTargetId}
                onWorkerProfileChange={setSelectedWorkerProfileId}
              />
              {uploadEstimate && (
                <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                  Estimate: {estimateSummary(uploadEstimate)}
                </div>
              )}
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
      ) : tilesets.length === 0 && sourceImports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Database className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">No tilesets yet</h3>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Upload a data file or import Overture data to create a versioned
            tileset.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Globe className="mr-2 h-4 w-4" />
              Import Overture
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Upload tileset
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <SourceWorkflowGuide
            tilesets={tilesets}
            sourceImports={sourceImports}
            styles={styles}
            publishingVersionId={publishingVersionId}
            tilingImportId={tilingImportId}
            onImport={() => setImportOpen(true)}
            onUpload={() => setUploadOpen(true)}
            onCreateTilesetFromImport={handleCreateTilesetFromImport}
            onPublishTileset={handlePublish}
          />

          {tilesets.length > 0 && (
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
              const latestJob = latestJobForTileset(jobs, tileset.id);
              const validation = tileset.latestUpload?.validationResult;
              const artifact = displayVersion?.artifact;
              const canPublish = Boolean(
                tileset.latestVersion &&
                tileset.latestVersion.id !== tileset.currentVersion?.id,
              );
              const showDetails = Boolean(
                validation ||
                  artifact ||
                  tileset.latestUpload ||
                  tileset.status === "BUILDING" ||
                  latestJob?.status === "FAILED" ||
                  latestJob?.cancelRequestedAt,
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
                      {latestJob && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {latestJob.status}
                          {latestJob.cancelRequestedAt
                            ? " - cancel requested"
                            : ""}
                          {latestJob.status !== "SUCCEEDED"
                            ? ` - ${latestJob.progress}%`
                            : ""}
                        </div>
                      )}
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
                          onClick={() => handleRebuild(tileset)}
                          disabled={
                            !canRebuildTileset(tileset) ||
                            rebuildingTilesetId === tileset.id
                          }
                          title="Rebuild from original upload"
                        >
                          {rebuildingTilesetId === tileset.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
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
                        {latestJob && canRetryJob(latestJob) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetryJob(latestJob)}
                            disabled={controllingJobId === latestJob.id}
                            title="Retry build"
                          >
                            {controllingJobId === latestJob.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {latestJob && canCancelJob(latestJob) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelJob(latestJob)}
                            disabled={controllingJobId === latestJob.id}
                            title="Cancel build"
                          >
                            {controllingJobId === latestJob.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                      </TableRow>
                      {showDetails && (
                        <TableRow>
                      <TableCell colSpan={8} className="bg-muted/20">
                        <div className="space-y-2 py-2 text-xs text-muted-foreground">
                          {(tileset.status === "BUILDING" ||
                            latestJob?.status === "FAILED" ||
                            latestJob?.cancelRequestedAt) && (
                            <div className="flex items-center gap-2">
                              {latestJob?.status === "FAILED" ? (
                                <AlertCircle className="h-3 w-3" />
                              ) : (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              )}
                              {jobStatusMessage(latestJob)}
                            </div>
                          )}
                          <div className="grid gap-2 md:grid-cols-3">
                            <div>
                              <div className="font-medium text-foreground">
                                Upload
                              </div>
                              <div>{uploadSummary(tileset)}</div>
                            </div>
                            <div>
                              <div className="font-medium text-foreground">
                                Validation
                              </div>
                              <div>{validationSummary(validation)}</div>
                              <div>{boundsSummary(validation?.bounds)}</div>
                            </div>
                            <div>
                              <div className="font-medium text-foreground">
                                Artifact
                              </div>
                              <div>{artifactSummary(displayVersion)}</div>
                              {artifact && (
                                <div className="mt-1 flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2"
                                    onClick={() =>
                                      handleCopyArtifactUrl(displayVersion)
                                    }
                                  >
                                    <Copy className="mr-1 h-3 w-3" />
                                    Copy
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2"
                                    onClick={() =>
                                      window.open(
                                        artifact.url,
                                        "_blank",
                                        "noopener,noreferrer",
                                      )
                                    }
                                  >
                                    <ExternalLink className="mr-1 h-3 w-3" />
                                    Open
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                          {tileset.versions.length > 1 && (
                            <div className="flex flex-wrap items-center gap-1 border-t pt-2">
                              <span className="mr-1 font-medium text-foreground">
                                Versions
                              </span>
                              {tileset.versions.map((version) => {
                                const current =
                                  version.id === tileset.currentVersionId;
                                const currentVersionNumber =
                                  tileset.currentVersion?.version ??
                                  tileset.versions.find(
                                    (candidate) =>
                                      candidate.id === tileset.currentVersionId,
                                  )?.version;
                                return (
                                  <Button
                                    key={version.id}
                                    variant={current ? "secondary" : "ghost"}
                                    size="sm"
                                    className="h-6 gap-1 px-2 text-xs"
                                    disabled={
                                      current ||
                                      publishingVersionId === version.id ||
                                      !version.artifact
                                    }
                                    onClick={() =>
                                      handlePublish(tileset, version)
                                    }
                                  >
                                    {publishingVersionId === version.id && (
                                      <RefreshCw className="h-3 w-3 animate-spin" />
                                    )}
                                    {tilesetVersionActionLabel({
                                      version,
                                      currentVersionId:
                                        tileset.currentVersionId,
                                      currentVersionNumber,
                                    })}
                                  </Button>
                                );
                              })}
                            </div>
                          )}
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

          {sourceImports.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Imported datasets</h2>
                </div>
                <RuntimeSelectors
                  executionTargets={executionTargets}
                  workerProfiles={workerProfiles}
                  selectedExecutionTargetId={selectedExecutionTargetId}
                  selectedWorkerProfileId={selectedWorkerProfileId}
                  onExecutionTargetChange={setSelectedExecutionTargetId}
                  onWorkerProfileChange={setSelectedWorkerProfileId}
                  compact
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Features</TableHead>
                    <TableHead>Dataset</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-28">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceImports.map((sourceImport) => (
                    <TableRow key={sourceImport.id}>
                      <TableCell>
                        <div className="font-medium">
                          {sourceImportSummary(sourceImport)}
                        </div>
                        {sourceImport.output?.warnings &&
                          sourceImport.output.warnings.length > 0 && (
                            <div className="mt-1 text-xs text-amber-600">
                              {sourceImport.output.warnings.join(", ")}
                            </div>
                          )}
                        {sourceImport.errorMessage && (
                          <div className="mt-1 text-xs text-destructive">
                            {sourceImport.errorMessage}
                          </div>
                        )}
                        {importEstimates[sourceImport.id] && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Estimate: {estimateSummary(importEstimates[sourceImport.id]!)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={sourceImportStatusVariant(
                            sourceImport.status,
                          )}
                        >
                          {sourceImport.status === "PROCESSING" && (
                            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          {sourceImport.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {typeof sourceImport.output?.featureCount === "number"
                          ? sourceImport.output.featureCount.toLocaleString()
                          : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {sourceImport.datasetId ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(sourceImport.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCreateTilesetFromImport(sourceImport)}
                          disabled={
                            !canCreateTilesetFromImport(sourceImport) ||
                            tilingImportId === sourceImport.id
                          }
                          title="Create tileset from import"
                        >
                          {tilingImportId === sourceImport.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Database className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
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

function RuntimeSelectors({
  executionTargets,
  workerProfiles,
  selectedExecutionTargetId,
  selectedWorkerProfileId,
  onExecutionTargetChange,
  onWorkerProfileChange,
  compact = false,
}: {
  executionTargets: ConsoleExecutionTarget[];
  workerProfiles: ConsoleWorkerProfile[];
  selectedExecutionTargetId: string;
  selectedWorkerProfileId: string;
  onExecutionTargetChange: (value: string) => void;
  onWorkerProfileChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-3"}>
      <div className={compact ? "min-w-40" : "space-y-2"}>
        {!compact && <Label>Execution target</Label>}
        <Select value={selectedExecutionTargetId} onValueChange={onExecutionTargetChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Local default</SelectItem>
            {executionTargets.map((target) => (
              <SelectItem key={target.id} value={target.id}>
                {target.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={compact ? "min-w-40" : "space-y-2"}>
        {!compact && <Label>Worker profile</Label>}
        <Select value={selectedWorkerProfileId} onValueChange={onWorkerProfileChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default worker</SelectItem>
            {workerProfiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function runtimeSelectionPayload(
  executionTargetId: string,
  workerProfileId: string,
) {
  return {
    executionTargetId:
      executionTargetId === "default" ? undefined : executionTargetId,
    workerProfileId: workerProfileId === "default" ? undefined : workerProfileId,
  };
}

function estimateSummary(estimate: ProcessingEstimate) {
  return `${formatDuration(estimate.minSeconds)}-${formatDuration(
    estimate.maxSeconds,
  )} (${estimate.confidence})`;
}

function formatDuration(seconds: number) {
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function vectorLayerCount(version: ConsoleTilesetVersion | null) {
  return version?.schema?.vector_layers?.length ?? 0;
}

function uploadSummary(tileset: ConsoleTileset) {
  const upload = tileset.latestUpload;
  if (!upload) return "No linked upload.";
  const size = upload.size ? formatBytes(upload.size) : "unknown size";
  return `${upload.originalFileName} - ${upload.status} - ${size}`;
}

function validationSummary(validation: ConsoleUploadValidation | null | undefined) {
  if (!validation) return "No validation result yet.";
  const fields = Object.keys(validation.schema?.fields ?? {}).length;
  const features =
    typeof validation.featureCount === "number"
      ? `${validation.featureCount.toLocaleString()} features`
      : "feature count unavailable";
  return `${validation.format ?? "source"} - ${features} - ${fields} fields`;
}

function boundsSummary(
  bounds: [number, number, number, number] | null | undefined,
) {
  if (!bounds) return "Bounds unavailable.";
  return `Bounds ${bounds.map((value) => value.toFixed(4)).join(", ")}`;
}

function artifactSummary(version: ConsoleTilesetVersion | null) {
  if (!version?.artifact) return "No processed artifact yet.";
  const size = version.artifact.size
    ? formatBytes(version.artifact.size)
    : "unknown size";
  return `${version.format} v${version.version} - ${size}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function latestJobForTileset(
  jobs: ConsoleProcessingJob[],
  tilesetId: string,
): ConsoleProcessingJob | null {
  return (
    jobs.find(
      (job) =>
        (job.type === "tileset.process_upload" ||
          job.type === "tileset.process_dataset") &&
        job.input?.tilesetId === tilesetId,
    ) ?? null
  );
}

function jobStatusMessage(job: ConsoleProcessingJob | null) {
  if (!job) return "Upload validation and tile generation are queued.";
  if (job.cancelRequestedAt) {
    return "Cancellation has been requested; the worker will stop at the next checkpoint.";
  }
  if (job.status === "CANCELED") {
    return "Tile generation was canceled.";
  }
  if (job.status === "FAILED") {
    return job.errorMessage ?? "Tile generation failed.";
  }
  const stage = job.output?.stage ? ` (${job.output.stage})` : "";
  return `Upload validation and tile generation are running: ${job.progress}%${stage}`;
}

function canRetryJob(job: ConsoleProcessingJob) {
  return job.status === "FAILED" || job.status === "CANCELED";
}

function canCancelJob(job: ConsoleProcessingJob) {
  return (
    (job.status === "PENDING" || job.status === "PROCESSING") &&
    !job.cancelRequestedAt
  );
}
