"use client"

import * as React from "react"
import type { Table as TanStackTable } from "@tanstack/react-table"
import { Button } from "@planisfy/ui/components/button"

function TablePagination<TData>({ table }: { table: TanStackTable<TData> }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="text-sm text-muted-foreground">
        {table.getFilteredSelectedRowModel().rows.length} of{" "}
        {table.getFilteredRowModel().rows.length} row(s) selected.
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export { TablePagination }
