"use client"

import { useRouter } from "next/navigation"
import { Card } from "@planisfy/ui/components/card"
import { StyleActionsMenu } from "@/components/studio/style-actions-menu"
import { StyleStatusBadge } from "@/components/studio/style-status-badge"
import {
  formatStyleUpdatedAt,
  styleDetailHref,
  type StudioStyleSummary,
} from "@/lib/studio/style-workflow"

interface StyleCardProps {
  style: StudioStyleSummary
  onMutate?: () => void
}

export function StyleCard({ style, onMutate }: StyleCardProps) {
  const router = useRouter()

  const handleOpen = () => {
    router.push(styleDetailHref(style))
  }

  return (
    <Card
      className="group cursor-pointer transition-shadow hover:shadow-md"
      onClick={handleOpen}
    >
      <div className="flex h-32 items-center justify-center rounded-t-lg bg-gradient-to-br from-muted to-muted/50">
        {style.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={style.thumbnailUrl}
            alt={style.name}
            className="h-full w-full rounded-t-lg object-cover"
          />
        ) : (
          <div className="text-3xl text-muted-foreground/30">
            {style.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium">{style.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatStyleUpdatedAt(style.updatedAt)}
            </p>
          </div>
          <div className="ml-2 flex items-center gap-1">
            <StyleStatusBadge isPublic={style.isPublic} />
            <StyleActionsMenu
              style={style}
              onMutate={onMutate}
              triggerClassName="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
