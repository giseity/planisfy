"use client";

import { useState } from "react";
import type { ConsoleTileset } from "@/lib/api";
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
import { FileDropzone } from "@/components/file-upload/file-dropzone";

const MAX_UPLOAD_SIZE_BYTES = 250 * 1024 * 1024;
const SOURCE_ACCEPT = ".geojson,.json,.csv,.zip,.pmtiles,.mbtiles";
const SOURCE_ACCEPTED_LABEL =
  "GeoJSON, CSV, zipped Shapefile, PMTiles, MBTiles";

export function TilesetUploadDialog({
  tileset,
  open,
  onOpenChange,
  onUploaded,
}: {
  tileset: ConsoleTileset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}) {
  const [csvLatitude, setCsvLatitude] = useState("");
  const [csvLongitude, setCsvLongitude] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    try {
      await api.uploadTileset(tileset.id, file, {
        csvLatitude: csvLatitude || undefined,
        csvLongitude: csvLongitude || undefined,
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
          <FileDropzone
            id="tileset-upload-file"
            file={file}
            onFileChange={setFile}
            accept={SOURCE_ACCEPT}
            acceptedLabel={SOURCE_ACCEPTED_LABEL}
            maxSizeBytes={MAX_UPLOAD_SIZE_BYTES}
            title="Upload source file"
            disabled={uploading}
          />
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
