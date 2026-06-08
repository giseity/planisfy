import * as React from "react"
import { cn } from "@planisfy/ui/lib/utils"

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn("flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-6 text-center", className)}
      {...props}
    />
  )
}

function EmptyIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-icon"
      className={cn("flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5", className)}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3 data-slot="empty-title" className={cn("text-sm font-medium", className)} {...props} />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn("max-w-md text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function EmptyActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="empty-actions" className={cn("flex flex-wrap justify-center gap-2", className)} {...props} />
  )
}

export { Empty, EmptyActions, EmptyDescription, EmptyIcon, EmptyTitle }
