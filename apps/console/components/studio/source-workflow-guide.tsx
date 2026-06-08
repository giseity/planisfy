"use client";

import Link from "next/link";
import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Database,
  Globe,
  Palette,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { ConsoleSourceImport, ConsoleTileset } from "@/lib/api";
import {
  buildSourceWorkflowGuide,
  type SourceWorkflowGuideModel,
  type SourceWorkflowStyleSummary,
} from "@/lib/studio/source-workflow-guide";

export function SourceWorkflowGuide({
  tilesets,
  sourceImports,
  styles,
  publishingVersionId,
  tilingImportId,
  onImport,
  onUpload,
  onCreateTilesetFromImport,
  onPublishTileset,
}: {
  tilesets: ConsoleTileset[];
  sourceImports: ConsoleSourceImport[];
  styles: SourceWorkflowStyleSummary[];
  publishingVersionId: string | null;
  tilingImportId: string | null;
  onImport: () => void;
  onUpload: () => void;
  onCreateTilesetFromImport: (sourceImport: ConsoleSourceImport) => void;
  onPublishTileset: (tileset: ConsoleTileset) => void;
}) {
  const guide = buildSourceWorkflowGuide({ tilesets, sourceImports, styles });

  return (
    <div className="rounded-md border bg-muted/15 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Source workflow</h2>
            <Badge variant={guide.badgeVariant}>{guide.badge}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {guide.steps.map((step) => {
              const Icon = step.state === "done" ? CheckCircle2 : Circle;
              return (
                <div
                  key={step.label}
                  className="flex min-h-16 items-start gap-2 rounded-md border bg-background px-3 py-2"
                >
                  <Icon
                    className={
                      step.state === "done"
                        ? "mt-0.5 h-4 w-4 text-emerald-600"
                        : step.state === "current"
                          ? "mt-0.5 h-4 w-4 text-primary"
                          : "mt-0.5 h-4 w-4 text-muted-foreground/50"
                    }
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-5">
                      {step.label}
                    </div>
                    <div className="text-xs leading-5 text-muted-foreground">
                      {step.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <WorkflowAction
          guide={guide}
          publishingVersionId={publishingVersionId}
          tilingImportId={tilingImportId}
          onImport={onImport}
          onUpload={onUpload}
          onCreateTilesetFromImport={onCreateTilesetFromImport}
          onPublishTileset={onPublishTileset}
        />
      </div>
    </div>
  );
}

function WorkflowAction({
  guide,
  publishingVersionId,
  tilingImportId,
  onImport,
  onUpload,
  onCreateTilesetFromImport,
  onPublishTileset,
}: {
  guide: SourceWorkflowGuideModel;
  publishingVersionId: string | null;
  tilingImportId: string | null;
  onImport: () => void;
  onUpload: () => void;
  onCreateTilesetFromImport: (sourceImport: ConsoleSourceImport) => void;
  onPublishTileset: (tileset: ConsoleTileset) => void;
}) {
  switch (guide.nextAction.kind) {
    case "add-source":
      return (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={onImport}>
            <Globe className="mr-2 h-4 w-4" />
            Import Overture
          </Button>
          <Button onClick={onUpload}>
            <Plus className="mr-2 h-4 w-4" />
            Upload tileset
          </Button>
        </div>
      );
    case "create-tileset": {
      const createTilesetAction = guide.nextAction;
      return (
        <Button
          className="shrink-0"
          onClick={() =>
            onCreateTilesetFromImport(createTilesetAction.sourceImport)
          }
          disabled={tilingImportId === createTilesetAction.sourceImport.id}
        >
          {tilingImportId === createTilesetAction.sourceImport.id ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Database className="mr-2 h-4 w-4" />
          )}
          Create tileset
        </Button>
      );
    }
    case "publish-tileset": {
      const publishTilesetAction = guide.nextAction;
      return (
        <Button
          className="shrink-0"
          onClick={() => onPublishTileset(publishTilesetAction.tileset)}
          disabled={
            publishingVersionId ===
            publishTilesetAction.tileset.latestVersion?.id
          }
        >
          {publishingVersionId ===
          publishTilesetAction.tileset.latestVersion?.id ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Globe className="mr-2 h-4 w-4" />
          )}
          Publish tileset
        </Button>
      );
    }
    case "create-style":
      return (
        <Button className="shrink-0" asChild>
          <Link href="/styles">
            <Palette className="mr-2 h-4 w-4" />
            Create style
          </Link>
        </Button>
      );
    case "publish-style":
      return (
        <Button className="shrink-0" variant="outline" asChild>
          <Link href="/styles">
            <Palette className="mr-2 h-4 w-4" />
            Open styles
          </Link>
        </Button>
      );
    case "open-dashboard":
      return (
        <Button className="shrink-0" variant="outline" asChild>
          <Link href="/">
            View integration
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      );
  }
}
