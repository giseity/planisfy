"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ConsoleProcessingJob,
  type ConsoleTileset,
  type ConsoleTilesetVersion,
} from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@planisfy/ui/components/alert-dialog";
import { Button } from "@planisfy/ui/components/button";
import { Skeleton } from "@planisfy/ui/components/skeleton";
import { Plus, Database } from "lucide-react";
import { toast } from "sonner";
import { CreateTilesetDialog } from "@/features/tilesets/components/create-tileset-dialog";
import { SourceTilesetsTable } from "@/features/tilesets/components/source-tilesets-table";

export default function SourcesPage() {
  const [tilesets, setTilesets] = useState<ConsoleTileset[]>([]);
  const [jobs, setJobs] = useState<ConsoleProcessingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(
    null,
  );
  const [controllingJobId, setControllingJobId] = useState<string | null>(null);
  const [rebuildingTilesetId, setRebuildingTilesetId] = useState<string | null>(
    null,
  );
  const [deleteTileset, setDeleteTileset] = useState<ConsoleTileset | null>(
    null,
  );
  const [deletingTilesetId, setDeletingTilesetId] = useState<string | null>(
    null,
  );

  const fetchTilesets = useCallback(async () => {
    try {
      const [tilesetsRes, jobsRes] = await Promise.all([
        api.listTilesets(),
        api.listJobs(),
      ]);
      setTilesets(tilesetsRes.data);
      setJobs(jobsRes.data);
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

  async function handleDeleteTileset() {
    if (!deleteTileset) return;

    setDeletingTilesetId(deleteTileset.id);
    try {
      await api.deleteTileset(deleteTileset.id);
      toast.success(`Deleted ${deleteTileset.handle}`);
      setDeleteTileset(null);
      fetchTilesets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tileset");
    } finally {
      setDeletingTilesetId(null);
    }
  }

  return (
    <div className="container max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tilesets</h1>
        <div className="flex items-center gap-2">
          <CreateTilesetDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={fetchTilesets}
            trigger={
              <Button data-testid="create-tileset">
                <Plus className="mr-2 h-4 w-4" />
                Create tileset
              </Button>
            }
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : tilesets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Database className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">No tilesets yet</h3>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Create a tileset, then attach an upload or Overture source from its
            detail page.
          </p>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCreateOpen(true)}
              data-testid="create-tileset-empty"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create tileset
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
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
            onRequestDelete={setDeleteTileset}
          />
        </div>
      )}
      <AlertDialog
        open={Boolean(deleteTileset)}
        onOpenChange={(open) => {
          if (!open) setDeleteTileset(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{deleteTileset?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the tileset from Console and makes its public TileJSON
              unavailable. Uploaded source files and processed artifacts remain in
              storage for audit and backup retention.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingTilesetId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTileset}
              disabled={Boolean(deletingTilesetId)}
            >
              {deletingTilesetId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
