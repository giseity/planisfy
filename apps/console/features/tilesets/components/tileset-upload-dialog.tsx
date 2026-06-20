"use client";

import { useEffect, useState } from "react";
import type {
  ConsoleExecutionTarget,
  ConsoleTileset,
  ConsoleWorkerProfile,
  ProcessingEstimate,
} from "@/lib/api";
import { api } from "@/lib/api";
import { Button } from "@planisfy/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@planisfy/ui/components/dialog";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import { RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { SourceRuntimeSelectors } from "@/features/tilesets/components/source-runtime-selectors";
import {
  estimateSummary,
  runtimeSelectionPayload,
} from "@/features/tilesets/workflow/source-runtime";

export function TilesetUploadDialog({
  tileset,
  open,
  onOpenChange,
  executionTargets,
  workerProfiles,
  selectedExecutionTargetId,
  selectedWorkerProfileId,
  onExecutionTargetChange,
  onWorkerProfileChange,
  onUploaded,
}: {
  tileset: ConsoleTileset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executionTargets: ConsoleExecutionTarget[];
  workerProfiles: ConsoleWorkerProfile[];
  selectedExecutionTargetId: string;
  selectedWorkerProfileId: string;
  onExecutionTargetChange: (value: string) => void;
  onWorkerProfileChange: (value: string) => void;
  onUploaded: () => void;
}) {
  const [csvLatitude, setCsvLatitude] = useState("");
  const [csvLongitude, setCsvLongitude] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadEstimate, setUploadEstimate] =
    useState<ProcessingEstimate | null>(null);

  useEffect(() => {
    if (!open || !file) {
      setUploadEstimate(null);
      return;
    }

    let canceled = false;
    api
      .estimateProcessingJob({
        ...runtimeSelectionPayload(
          selectedExecutionTargetId,
          selectedWorkerProfileId,
        ),
        sourceSizeBytes: file.size,
        minZoom: tileset.minZoom ?? 0,
        maxZoom: tileset.maxZoom ?? 14,
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
    open,
    selectedExecutionTargetId,
    selectedWorkerProfileId,
    tileset.maxZoom,
    tileset.minZoom,
  ]);

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    try {
      await api.uploadTileset(tileset.id, file, {
        csvLatitude: csvLatitude || undefined,
        csvLongitude: csvLongitude || undefined,
        ...runtimeSelectionPayload(
          selectedExecutionTargetId,
          selectedWorkerProfileId,
        ),
      });
      resetUploadForm();
      onOpenChange(false);
      toast.success("Tileset upload queued");
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

  function resetUploadForm() {
    setCsvLatitude("");
    setCsvLongitude("");
    setFile(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="upload-tileset">
          <Upload className="mr-2 h-4 w-4" />
          Upload source
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload source</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
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
            <Label htmlFor="tileset-upload-file">File (required)</Label>
            <Input
              id="tileset-upload-file"
              type="file"
              required
              accept=".geojson,.json,.csv,.zip,.pmtiles,.mbtiles"
              aria-describedby="tileset-upload-file-help"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p
              id="tileset-upload-file-help"
              className="text-xs text-muted-foreground"
            >
              GeoJSON, CSV, zipped Shapefile, PMTiles, or MBTiles.
            </p>
          </div>
          <SourceRuntimeSelectors
            executionTargets={executionTargets}
            workerProfiles={workerProfiles}
            selectedExecutionTargetId={selectedExecutionTargetId}
            selectedWorkerProfileId={selectedWorkerProfileId}
            onExecutionTargetChange={onExecutionTargetChange}
            onWorkerProfileChange={onWorkerProfileChange}
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
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              data-testid="upload-tileset-submit"
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
  );
}
