import * as React from "react"
import { cn } from "@planisfy/ui/lib/utils"

function TableToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-toolbar"
      className={cn("mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className)}
      {...props}
    />
  )
}

function TableToolbarActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-toolbar-actions"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export { TableToolbar, TableToolbarActions }
