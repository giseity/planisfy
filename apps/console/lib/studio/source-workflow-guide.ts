import type { ConsoleSourceImport, ConsoleTileset } from "@/lib/api";
import { canCreateTilesetFromImport } from "@/lib/studio/import-workflow";

export interface SourceWorkflowStyleSummary {
  id: string;
  isPublic: boolean;
}

export type SourceWorkflowStepState = "done" | "current" | "pending";

export interface SourceWorkflowStep {
  label: string;
  detail: string;
  state: SourceWorkflowStepState;
}

export type SourceWorkflowNextAction =
  | { kind: "add-source" }
  | { kind: "create-tileset"; sourceImport: ConsoleSourceImport }
  | { kind: "publish-tileset"; tileset: ConsoleTileset }
  | { kind: "create-style" }
  | { kind: "publish-style" }
  | { kind: "open-dashboard" };

export interface SourceWorkflowGuideModel {
  badge: string;
  badgeVariant: "secondary" | "success" | "warning";
  steps: SourceWorkflowStep[];
  nextAction: SourceWorkflowNextAction;
}

export function buildSourceWorkflowGuide(params: {
  tilesets: ConsoleTileset[];
  sourceImports: ConsoleSourceImport[];
  styles: SourceWorkflowStyleSummary[];
}): SourceWorkflowGuideModel {
  const { tilesets, sourceImports, styles } = params;
  const hasSourceData = tilesets.length > 0 || sourceImports.length > 0;
  const readyImport = sourceImports.find(canCreateTilesetFromImport);
  const hasTileset = tilesets.length > 0;
  const buildingTileset = tilesets.some(
    (tileset) => tileset.status === "BUILDING",
  );
  const publishableTileset = tilesets.find((tileset) =>
    Boolean(
      tileset.latestVersion &&
        tileset.latestVersion.id !== tileset.currentVersion?.id,
    ),
  );
  const hasPublishedTileset = tilesets.some(
    (tileset) => tileset.isPublished && Boolean(tileset.tilejsonUrl),
  );
  const hasStyle = styles.length > 0;
  const hasPublicStyle = styles.some((style) => style.isPublic);

  let nextAction: SourceWorkflowNextAction = { kind: "open-dashboard" };
  if (!hasSourceData) {
    nextAction = { kind: "add-source" };
  } else if (readyImport) {
    nextAction = { kind: "create-tileset", sourceImport: readyImport };
  } else if (publishableTileset) {
    nextAction = { kind: "publish-tileset", tileset: publishableTileset };
  } else if (hasPublishedTileset && !hasStyle) {
    nextAction = { kind: "create-style" };
  } else if (hasStyle && !hasPublicStyle) {
    nextAction = { kind: "publish-style" };
  }

  const sourceItemCount = sourceImports.length + tilesets.length;
  const steps: SourceWorkflowStep[] = [
    {
      label: "Source data",
      detail: hasSourceData
        ? `${sourceItemCount} item${sourceItemCount === 1 ? "" : "s"}`
        : "Waiting",
      state: hasSourceData ? "done" : "current",
    },
    {
      label: "Build tileset",
      detail: buildingTileset
        ? "Processing"
        : hasTileset
          ? `${tilesets.length} tileset${tilesets.length === 1 ? "" : "s"}`
          : "Queued next",
      state: hasTileset ? "done" : hasSourceData ? "current" : "pending",
    },
    {
      label: "Publish tileset",
      detail: hasPublishedTileset
        ? "TileJSON ready"
        : publishableTileset
          ? "Version ready"
          : "Pending build",
      state: hasPublishedTileset
        ? "done"
        : publishableTileset
          ? "current"
          : "pending",
    },
    {
      label: "Design style",
      detail: hasStyle
        ? `${styles.length} style${styles.length === 1 ? "" : "s"}`
        : "Needs source",
      state: hasStyle ? "done" : hasPublishedTileset ? "current" : "pending",
    },
    {
      label: "Publish style",
      detail: hasPublicStyle
        ? "Integration ready"
        : hasStyle
          ? "Draft"
          : "Pending style",
      state: hasPublicStyle ? "done" : hasStyle ? "current" : "pending",
    },
  ];

  return {
    badge: hasPublicStyle
      ? "Ready"
      : nextAction.kind === "open-dashboard"
        ? "Configured"
        : "Next action",
    badgeVariant: hasPublicStyle
      ? "success"
      : buildingTileset
        ? "warning"
        : "secondary",
    steps,
    nextAction,
  };
}
