import * as React from "react"
import { Spinner } from "@planisfy/ui/components/spinner"
import { cn } from "@planisfy/ui/lib/utils"

function LoadingState({
  label = "Loading...",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div className={cn("flex min-h-48 items-center justify-center gap-2 rounded-md border text-sm text-muted-foreground", className)}>
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

export { LoadingState }
