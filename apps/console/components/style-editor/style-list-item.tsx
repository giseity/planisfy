"use client";

import { useRouter } from "next/navigation";
import { StyleActionsMenu } from "@/components/style-editor/style-actions-menu";
import { StyleStatusBadge } from "@/components/style-editor/style-status-badge";
import {
  formatStyleUpdatedAt,
  styleDetailHref,
  type StudioStyleSummary,
} from "@/lib/studio/style-workflow";

interface StyleListItemProps {
  style: StudioStyleSummary;
  onMutate?: () => void;
}

export function StyleListItem({ style, onMutate }: StyleListItemProps) {
  const router = useRouter();

  const handleOpen = () => {
    router.push(styleDetailHref(style));
  };

  return (
    <div
      className="group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/50"
      onClick={handleOpen}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gradient-to-br from-muted to-muted/50 text-xs font-medium text-muted-foreground/40">
        {style.name.charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium">{style.name}</h3>
      </div>

      <StyleStatusBadge isPublic={style.isPublic} className="shrink-0" />

      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
        v{style.version}
      </span>

      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
        {formatStyleUpdatedAt(style.updatedAt)}
      </span>

      <StyleActionsMenu
        style={style}
        onMutate={onMutate}
        triggerClassName="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  );
}
