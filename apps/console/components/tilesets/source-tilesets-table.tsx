"use client";

import { Fragment } from "react";
import Link from "next/link";
import type {
  ConsoleProcessingJob,
  ConsoleTileset,
  ConsoleTilesetVersion,
  ConsoleUploadValidation,
} from "@/lib/api";
import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import {
  AlertCircle,
  Ban,
  Copy,
  ExternalLink,
  Globe,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  canRebuildTileset,
  tilesetVersionActionLabel,
} from "@/lib/studio/tileset-workflow";

export function SourceTilesetsTable({
  tilesets,
  jobs,
  publishingVersionId,
  rebuildingTilesetId,
  controllingJobId,
  onPublish,
  onRebuild,
  onCopyUrl,
  onCopyArtifactUrl,
  onRetryJob,
  onCancelJob,
}: {
  tilesets: ConsoleTileset[];
  jobs: ConsoleProcessingJob[];
  publishingVersionId: string | null;
  rebuildingTilesetId: string | null;
  controllingJobId: string | null;
  onPublish: (
    tileset: ConsoleTileset,
    version?: ConsoleTilesetVersion | null,
  ) => void;
  onRebuild: (tileset: ConsoleTileset) => void;
  onCopyUrl: (tileset: ConsoleTileset) => void;
  onCopyArtifactUrl: (version: ConsoleTilesetVersion | null) => void;
  onRetryJob: (job: ConsoleProcessingJob) => void;
  onCancelJob: (job: ConsoleProcessingJob) => void;
}) {
  return (
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
            tileset.latestVersion.id !== tileset.currentVersion?.id &&
            hasAvailableArtifact(tileset.latestVersion),
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
                  <Link
                    href={`/tilesets/${tileset.id}`}
                    className="hover:underline"
                  >
                    {tileset.name}
                  </Link>
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
                      {latestJob.cancelRequestedAt ? " - cancel requested" : ""}
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
                      onClick={() => onPublish(tileset)}
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
                      onClick={() => onRebuild(tileset)}
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
                      onClick={() => onCopyUrl(tileset)}
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
                        onClick={() => onRetryJob(latestJob)}
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
                        onClick={() => onCancelJob(latestJob)}
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
                                  onCopyArtifactUrl(displayVersion)
                                }
                                disabled={!artifact.availability.ok}
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
                                disabled={!artifact.availability.ok}
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
                                  !hasAvailableArtifact(version)
                                }
                                onClick={() => onPublish(tileset, version)}
                              >
                                {publishingVersionId === version.id && (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                )}
                                {tilesetVersionActionLabel({
                                  version,
                                  currentVersionId: tileset.currentVersionId,
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

function uploadSummary(tileset: ConsoleTileset) {
  const upload = tileset.latestUpload;
  if (!upload) return "No linked upload.";
  const size = upload.size ? formatBytes(upload.size) : "unknown size";
  if (upload.artifactAvailability && !upload.artifactAvailability.ok) {
    return `${upload.originalFileName} - ${upload.artifactAvailability.message}`;
  }
  return `${upload.originalFileName} - ${upload.status} - ${size}`;
}

function validationSummary(
  validation: ConsoleUploadValidation | null | undefined,
) {
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
  if (!version?.artifact) {
    return version?.artifactStorageObjectId
      ? "Processed artifact record is missing."
      : "No processed artifact yet.";
  }
  if (!version.artifact.availability.ok) {
    return `${version.format} v${version.version} - ${version.artifact.availability.message}`;
  }
  const size = version.artifact.size
    ? formatBytes(version.artifact.size)
    : "unknown size";
  return `${version.format} v${version.version} - ${size}`;
}

function hasAvailableArtifact(
  version: ConsoleTilesetVersion | null | undefined,
) {
  return Boolean(version?.artifact?.availability.ok);
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
