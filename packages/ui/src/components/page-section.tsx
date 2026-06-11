import * as React from "react"
import { cn } from "@planisfy/ui/lib/utils"

function PageSection({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="page-section"
      className={cn("space-y-3", className)}
      {...props}
    />
  )
}

function PageSectionHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-section-header"
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      {...props}
    />
  )
}

function PageSectionText({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-section-text"
      className={cn("min-w-0", className)}
      {...props}
    />
  )
}

function PageSectionTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="page-section-title"
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  )
}

function PageSectionDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-section-description"
      className={cn("mt-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function PageSectionActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-section-actions"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export {
  PageSection,
  PageSectionActions,
  PageSectionDescription,
  PageSectionHeader,
  PageSectionText,
  PageSectionTitle,
}
