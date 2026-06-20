"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function CreateTilesetDialog({
  open,
  onOpenChange,
  onCreated,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [minZoom, setMinZoom] = useState(0);
  const [maxZoom, setMaxZoom] = useState(14);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name || !handle) return;

    setCreating(true);
    try {
      const res = await api.createTileset({
        name,
        handle,
        description: description || undefined,
        minZoom,
        maxZoom,
      });
      resetForm();
      onOpenChange(false);
      toast.success("Tileset created");
      onCreated?.();
      router.push(`/tilesets/${res.data.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create tileset",
      );
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setName("");
    setHandle("");
    setDescription("");
    setMinZoom(0);
    setMaxZoom(14);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create tileset</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="tileset-create-name">Name</Label>
            <Input
              id="tileset-create-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Buildings"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tileset-create-handle">Handle</Label>
            <Input
              id="tileset-create-handle"
              value={handle}
              onChange={(event) =>
                setHandle(
                  event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }
              placeholder="buildings"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens only.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tileset-create-description">Description</Label>
            <Input
              id="tileset-create-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tileset-create-minzoom">Min zoom</Label>
              <Input
                id="tileset-create-minzoom"
                type="number"
                min={0}
                max={24}
                value={minZoom}
                onChange={(event) => setMinZoom(Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tileset-create-maxzoom">Max zoom</Label>
              <Input
                id="tileset-create-maxzoom"
                type="number"
                min={0}
                max={24}
                value={maxZoom}
                onChange={(event) => setMaxZoom(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name || !handle || creating}
              data-testid="create-tileset-submit"
            >
              {creating ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
