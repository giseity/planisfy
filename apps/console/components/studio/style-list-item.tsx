"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@planisfy/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@planisfy/ui/components/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@planisfy/ui/components/dialog"
import { MoreHorizontal, Copy, Trash2, Globe, GlobeLock, Download, Link } from "lucide-react"
import { deleteStyle, duplicateStyle, togglePublish } from "@/app/studio/styles/actions"
import { api, type ApiEnvelope } from "@/lib/api"
import type { StyleData } from "./style-card"

interface StyleListItemProps {
  style: StyleData
  onMutate?: () => void
}

interface StyleJsonResponse {
  styleJson: unknown
}

function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export function StyleListItem({ style, onMutate }: StyleListItemProps) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleOpen = () => {
    router.push(`/studio/styles/${style.id}`)
  }

  const handleDuplicate = async () => {
    await duplicateStyle(style.id)
    onMutate?.()
  }

  const handleTogglePublish = async () => {
    await togglePublish(style.id)
    onMutate?.()
  }

  const handleDelete = async () => {
    setDeleting(true)
    await deleteStyle(style.id)
    setDeleteOpen(false)
    setDeleting(false)
    onMutate?.()
  }

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/studio/styles/${style.id}`
    await navigator.clipboard.writeText(url)
  }

  const handleDownloadJson = async () => {
    try {
      const res = await api.get<ApiEnvelope<StyleJsonResponse>>(`/styles/${style.id}`)
      const blob = new Blob([JSON.stringify(res.data.styleJson, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${style.name || "style"}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div
        className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={handleOpen}
      >
        {/* Mini thumbnail */}
        <div className="h-8 w-8 shrink-0 rounded bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center text-xs text-muted-foreground/40 font-medium">
          {style.name.charAt(0).toUpperCase()}
        </div>

        {/* Name + handle */}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium truncate">{style.name}</h3>
        </div>

        {/* Status badge */}
        {style.isPublic ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
            Public
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
            Draft
          </span>
        )}

        {/* Version */}
        <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">
          v{style.version}
        </span>

        {/* Time */}
        <span className="text-xs text-muted-foreground shrink-0 w-20 text-right">
          {timeAgo(style.updatedAt)}
        </span>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleTogglePublish}>
              {style.isPublic ? (
                <>
                  <GlobeLock className="h-3.5 w-3.5 mr-2" />
                  Unpublish
                </>
              ) : (
                <>
                  <Globe className="h-3.5 w-3.5 mr-2" />
                  Publish
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCopyUrl}>
              <Link className="h-3.5 w-3.5 mr-2" />
              Copy style URL
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadJson}>
              <Download className="h-3.5 w-3.5 mr-2" />
              Download JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{style.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The style will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
