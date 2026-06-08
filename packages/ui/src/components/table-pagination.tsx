"use client"

import * as React from "react"
import type { Table as TanStackTable } from "@tanstack/react-table"
import { Button } from "@planisfy/ui/components/button"

function TablePagination<TData>({ table }: { table: TanStackTable<TData> }) {
  const selectedRows = table.getFilteredSelectedRowModel().rows.length
  const filteredRows = table.getFilteredRowModel().rows.length
  const pageCount = table.getPageCount()

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="text-sm text-muted-foreground">
        {selectedRows > 0
          ? `${selectedRows} of ${filteredRows} row(s) selected.`
          : `${filteredRows} row(s)`}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {pageCount || 1}
        </span>
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
