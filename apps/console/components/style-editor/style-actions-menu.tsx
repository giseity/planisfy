"use client";

import { useState } from "react";
import { Button } from "@planisfy/ui/components/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@planisfy/ui/components/dropdown-menu";
import {
  Copy,
  Download,
  Globe,
  GlobeLock,
  Link,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  deleteStyle,
  duplicateStyle,
  togglePublish,
} from "@/app/(studio)/styles/actions";
import { api, type ApiEnvelope } from "@/lib/api";
import {
  styleEditorHref,
  styleJsonFilename,
  stylePublicUrl,
  type StudioStyleSummary,
} from "@/lib/studio/style-workflow";

interface StyleJsonResponse {
  styleJson: unknown;
}

export function StyleActionsMenu({
  style,
  onMutate,
  triggerClassName,
}: {
  style: StudioStyleSummary;
  onMutate?: () => void;
  triggerClassName?: string;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDuplicate = async () => {
    await duplicateStyle(style.id);
    onMutate?.();
  };

  const handleTogglePublish = async () => {
    await togglePublish(style.id);
    onMutate?.();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteStyle(style.id);
      setDeleteOpen(false);
      onMutate?.();
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyUrl = async () => {
    const url = await resolveStyleCopyUrl(style);
    await navigator.clipboard.writeText(url);
  };

  const handleDownloadJson = async () => {
    const res = await api.get<ApiEnvelope<StyleJsonResponse>>(
      `/styles/${style.id}`,
    );
    const blob = new Blob([JSON.stringify(res.data.styleJson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = styleJsonFilename(style);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className={triggerClassName}
            aria-label={`Open actions for ${style.name}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={handleDuplicate}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTogglePublish}>
            {style.isPublic ? (
              <>
                <GlobeLock className="mr-2 h-3.5 w-3.5" />
                Unpublish
              </>
            ) : (
              <>
                <Globe className="mr-2 h-3.5 w-3.5" />
                Publish
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCopyUrl}>
            <Link className="mr-2 h-3.5 w-3.5" />
            Copy style URL
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadJson}>
            <Download className="mr-2 h-3.5 w-3.5" />
            Download JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{style.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The style will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

async function resolveStyleCopyUrl(style: StudioStyleSummary): Promise<string> {
  if (!style.isPublic) {
    return `${window.location.origin}${styleEditorHref(style)}`;
  }

  const { data: profile } = await api.getProfile();
  return stylePublicUrl({
    origin: window.location.origin,
    ownerHandle: profile.handle,
    style,
  });
}
