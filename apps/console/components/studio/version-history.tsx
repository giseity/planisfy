"use client"

import { useEffect, useState } from "react"
import { Button } from "@planisfy/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@planisfy/ui/components/dialog"
import { History, RotateCcw, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { useStyleStore } from "@/lib/store/style-store"

interface VersionEntry {
  id: string
  version: number
  name: string
  createdBy: string | null
  createdAt: string
}

export function VersionHistoryButton() {
  const styleId = useStyleStore((s) => s.styleId)
  const [open, setOpen] = useState(false)

  if (!styleId) return null

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
        {open && <VersionList styleId={styleId} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function VersionList({ styleId, onClose }: { styleId: string; onClose: () => void }) {
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<number | null>(null)
  const loadStyleFromApi = useStyleStore((s) => s.loadStyleFromApi)
  const currentVersion = useStyleStore((s) => s.styleVersion)

  useEffect(() => {
    api
      .get<{ data: VersionEntry[] }>(`/styles/${styleId}/versions`)
      .then((res) => setVersions(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [styleId])

  const handleRestore = async (version: number) => {
    setRestoring(version)
    try {
      await api.post(`/styles/${styleId}/versions/${version}/restore`)
      await loadStyleFromApi(styleId)
      onClose()
    } catch {
      // ignore
    } finally {
      setRestoring(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No previous versions yet. Versions are created each time you save.
      </p>
    )
  }

  return (
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
          {v.version !== currentVersion && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs shrink-0"
              onClick={() => handleRestore(v.version)}
              disabled={restoring !== null}
            >
              {restoring === v.version ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Restore
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
