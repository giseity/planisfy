import * as React from "react"
import { cn } from "@planisfy/ui/lib/utils"

function PageHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header"
      className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}
      {...props}
    />
  )
}

function PageHeaderText({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="page-header-text" className={cn("min-w-0", className)} {...props} />
}

function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-title"
      className={cn("truncate text-2xl font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

function PageDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-description"
      className={cn("mt-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function PageActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="page-actions" className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
  )
}

export { PageActions, PageDescription, PageHeader, PageHeaderText, PageTitle }
