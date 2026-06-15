"use client";

import { useEffect, useState } from "react";
import { Button } from "@planisfy/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@planisfy/ui/components/dialog";
import { History, RotateCcw, Loader2, Link, Globe } from "lucide-react";
import { api } from "@/lib/api";
import { useStyleStore } from "@/lib/store/style-store";

interface VersionEntry {
  id: string;
  version: number;
  name: string;
  createdBy: string | null;
  createdAt: string;
}

export function VersionHistoryButton() {
  const styleId = useStyleStore((s) => s.styleId);
  const [open, setOpen] = useState(false);

  if (!styleId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          title="Version history"
        >
          <History className="h-3 w-3" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Previous versions are saved automatically each time you save.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <VersionList styleId={styleId} onClose={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function VersionList({
  styleId,
  onClose,
}: {
  styleId: string;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const loadStyleFromApi = useStyleStore((s) => s.loadStyleFromApi);
  const currentVersion = useStyleStore((s) => s.styleVersion);
  const isPublic = useStyleStore((s) => s.isPublic);
  const publishStyle = useStyleStore((s) => s.publishStyle);
  const [publishing, setPublishing] = useState(false);
  const [publishingVersion, setPublishingVersion] = useState<number | null>(
    null,
  );

  useEffect(() => {
    api
      .get<{ data: VersionEntry[] }>(`/styles/${styleId}/versions`)
      .then((res) => setVersions(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [styleId]);

  const handleCopyVersionUrl = async (version: number) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/styles/${styleId}?version=${version}`,
    );
  };

  const handlePublishToggle = async () => {
    setPublishing(true);
    try {
      await publishStyle();
    } finally {
      setPublishing(false);
    }
  };

  const handleRestore = async (version: number) => {
    setRestoring(version);
    try {
      await api.post(`/styles/${styleId}/versions/${version}/restore`);
      await loadStyleFromApi(styleId);
      onClose();
    } catch {
      // ignore
    } finally {
      setRestoring(null);
    }
  };

  const handlePublishVersion = async (version: number) => {
    setPublishingVersion(version);
    try {
      await api.publishStyleVersion(styleId, version);
      await loadStyleFromApi(styleId);
    } finally {
      setPublishingVersion(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No previous versions yet. Versions are created each time you save.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded border bg-muted/20 p-2">
        <div>
          <p className="text-xs font-medium">Publish state</p>
          <p className="text-[11px] text-muted-foreground">
            {isPublic ? "Published" : "Draft"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={handlePublishToggle}
          disabled={publishing}
        >
          {publishing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Globe className="h-3 w-3" />
          )}
          {isPublic ? "Unpublish" : "Publish"}
        </Button>
      </div>
      <div className="max-h-80 overflow-y-auto -mx-2">
        {versions.map((v) => (
          <div
            key={v.id}
            className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">v{v.version}</span>
                {v.version === currentVersion && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                    Current
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(v.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => handleCopyVersionUrl(v.version)}
              >
                <Link className="h-3 w-3" />
                URL
              </Button>
              {v.version !== currentVersion && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => handlePublishVersion(v.version)}
                    disabled={publishingVersion !== null}
                  >
                    {publishingVersion === v.version ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Globe className="h-3 w-3" />
                    )}
                    Publish
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => handleRestore(v.version)}
                    disabled={restoring !== null}
                  >
                    {restoring === v.version ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Roll back
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
