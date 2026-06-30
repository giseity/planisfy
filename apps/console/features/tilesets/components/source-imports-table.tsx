"use client";

import type {
  ConsoleSourceImport,
} from "@/lib/api";
import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { Database, RefreshCw } from "lucide-react";
import {
  canCreateTilesetFromImport,
  sourceImportStatusVariant,
  sourceImportSummary,
} from "@/features/tilesets/workflow/import-workflow";

export function SourceImportsTable({
  sourceImports,
  tilingImportId,
  onCreateTilesetFromImport,
}: {
  sourceImports: ConsoleSourceImport[];
  tilingImportId: string | null;
  onCreateTilesetFromImport: (sourceImport: ConsoleSourceImport) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Imported datasets</h2>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Features</TableHead>
            <TableHead>Dataset</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-28">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sourceImports.map((sourceImport) => (
            <TableRow key={sourceImport.id}>
              <TableCell>
                <div className="font-medium">
                  {sourceImportSummary(sourceImport)}
                </div>
                {sourceImport.output?.warnings &&
                  sourceImport.output.warnings.length > 0 && (
                    <div className="mt-1 text-xs text-amber-600">
                      {sourceImport.output.warnings.join(", ")}
                    </div>
                  )}
                {sourceImport.errorMessage && (
                  <div className="mt-1 text-xs text-destructive">
                    {sourceImport.errorMessage}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={sourceImportStatusVariant(sourceImport.status)}>
                  {sourceImport.status === "PROCESSING" && (
                    <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  {sourceImport.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {typeof sourceImport.output?.featureCount === "number"
                  ? sourceImport.output.featureCount.toLocaleString()
                  : "-"}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {sourceImport.datasetId ?? "-"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(sourceImport.updatedAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCreateTilesetFromImport(sourceImport)}
                  disabled={
                    !canCreateTilesetFromImport(sourceImport) ||
                    tilingImportId === sourceImport.id
                  }
                  title="Create tileset from import"
                >
                  {tilingImportId === sourceImport.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
