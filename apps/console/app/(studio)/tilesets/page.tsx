"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ApiEnvelope,
  type ConsoleExecutionTarget,
  type ConsoleProcessingJob,
  type ConsoleWorkerProfile,
  type ConsoleSourceImport,
  type ConsoleTileset,
  type ConsoleTilesetVersion,
  type ProcessingEstimate,
} from "@/lib/api";
import { Button } from "@planisfy/ui/components/button";
import { Skeleton } from "@planisfy/ui/components/skeleton";
import { Plus, Database, Globe } from "lucide-react";
import { toast } from "sonner";
import { OvertureImportDialog } from "@/features/tilesets/components/overture-import-dialog";
import { SourceImportsTable } from "@/features/tilesets/components/source-imports-table";
import { SourceTilesetsTable } from "@/features/tilesets/components/source-tilesets-table";
import { SourceWorkflowGuide } from "@/features/tilesets/components/source-workflow-guide";
import { TilesetUploadDialog } from "@/features/tilesets/components/tileset-upload-dialog";
import {
  canCreateTilesetFromImport,
  defaultTilesetOptionsForImport,
} from "@/features/tilesets/workflow/import-workflow";
import { runtimeSelectionPayload } from "@/features/tilesets/workflow/source-runtime";
import type { SourceWorkflowStyleSummary } from "@/features/tilesets/workflow/source-workflow-guide";

export default function SourcesPage() {
  const [tilesets, setTilesets] = useState<ConsoleTileset[]>([]);
  const [jobs, setJobs] = useState<ConsoleProcessingJob[]>([]);
  const [sourceImports, setSourceImports] = useState<ConsoleSourceImport[]>([]);
  const [styles, setStyles] = useState<SourceWorkflowStyleSummary[]>([]);
  const [executionTargets, setExecutionTargets] = useState<
    ConsoleExecutionTarget[]
  >([]);
  const [workerProfiles, setWorkerProfiles] = useState<ConsoleWorkerProfile[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(
    null,
  );
  const [controllingJobId, setControllingJobId] = useState<string | null>(null);
  const [rebuildingTilesetId, setRebuildingTilesetId] = useState<string | null>(
    null,
  );
  const [tilingImportId, setTilingImportId] = useState<string | null>(null);
  const [selectedExecutionTargetId, setSelectedExecutionTargetId] =
    useState("default");
  const [selectedWorkerProfileId, setSelectedWorkerProfileId] =
    useState("default");
  const [importEstimates, setImportEstimates] = useState<
    Record<string, ProcessingEstimate>
  >({});

  const fetchTilesets = useCallback(async () => {
    try {
      const [
        tilesetsRes,
        jobsRes,
        importsRes,
        stylesRes,
        targetsRes,
        profilesRes,
      ] = await Promise.all([
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
          ...runtimeSelectionPayload(
            selectedExecutionTargetId,
            selectedWorkerProfileId,
          ),
          featureCount: sourceImport.output?.featureCount,
          minZoom: 0,
          maxZoom: 14,
        });
        return [sourceImport.id, res.data] as const;
      }),
    )
      .then((entries) => {
        if (canceled) return;
        setImportEstimates((current) => ({
          ...current,
          ...Object.fromEntries(entries),
        }));
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
        err instanceof Error
          ? err.message
          : "Failed to promote tileset version",
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

  async function handleCreateTilesetFromImport(
    sourceImport: ConsoleSourceImport,
  ) {
    if (!sourceImport.datasetId || !sourceImport.output?.datasetVersionId)
      return;
    setTilingImportId(sourceImport.id);
    try {
      await api.createTilesetFromDataset(sourceImport.datasetId, {
        ...defaultTilesetOptionsForImport(sourceImport),
        datasetVersionId: sourceImport.output.datasetVersionId,
        ...runtimeSelectionPayload(
          selectedExecutionTargetId,
          selectedWorkerProfileId,
        ),
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
          <TilesetUploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            executionTargets={executionTargets}
            workerProfiles={workerProfiles}
            selectedExecutionTargetId={selectedExecutionTargetId}
            selectedWorkerProfileId={selectedWorkerProfileId}
            onExecutionTargetChange={setSelectedExecutionTargetId}
            onWorkerProfileChange={setSelectedWorkerProfileId}
            onUploaded={fetchTilesets}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
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
            <Button
              onClick={() => setUploadOpen(true)}
              data-testid="upload-tileset-empty"
            >
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
            <SourceTilesetsTable
              tilesets={tilesets}
              jobs={jobs}
              publishingVersionId={publishingVersionId}
              rebuildingTilesetId={rebuildingTilesetId}
              controllingJobId={controllingJobId}
              onPublish={handlePublish}
              onRebuild={handleRebuild}
              onCopyUrl={handleCopyUrl}
              onCopyArtifactUrl={handleCopyArtifactUrl}
              onRetryJob={handleRetryJob}
              onCancelJob={handleCancelJob}
            />
          )}

          {sourceImports.length > 0 && (
            <SourceImportsTable
              sourceImports={sourceImports}
              importEstimates={importEstimates}
              executionTargets={executionTargets}
              workerProfiles={workerProfiles}
              selectedExecutionTargetId={selectedExecutionTargetId}
              selectedWorkerProfileId={selectedWorkerProfileId}
              tilingImportId={tilingImportId}
              onExecutionTargetChange={setSelectedExecutionTargetId}
              onWorkerProfileChange={setSelectedWorkerProfileId}
              onCreateTilesetFromImport={handleCreateTilesetFromImport}
            />
          )}
        </div>
      )}
    </div>
  );
}
