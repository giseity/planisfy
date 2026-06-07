"use client";

import { useEffect, useState } from "react";
import type {
  ConsoleExecutionTarget,
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
import { Plus, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { SourceRuntimeSelectors } from "@/components/studio/source-runtime-selectors";
import {
  estimateSummary,
  runtimeSelectionPayload,
} from "@/lib/studio/source-runtime";

export function TilesetUploadDialog({
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
  const [newName, setNewName] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [description, setDescription] = useState("");
  const [minZoom, setMinZoom] = useState(0);
  const [maxZoom, setMaxZoom] = useState(14);
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
    open,
    selectedExecutionTargetId,
    selectedWorkerProfileId,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
  );
}
