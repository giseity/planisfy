import type { ConsoleSourceImport } from "@/lib/api";

export function canCreateTilesetFromImport(sourceImport: ConsoleSourceImport) {
  return Boolean(
    sourceImport.status === "SUCCEEDED" &&
      sourceImport.datasetId &&
      sourceImport.output?.datasetVersionId,
  );
}

export function defaultTilesetOptionsForImport(sourceImport: ConsoleSourceImport) {
  const type = sourceImport.input?.type ?? sourceImport.sourceName;
  const label =
    sourceImport.input?.catalog?.label ??
    titleCase(type.replaceAll("_", " "));

  return {
    name: `${label} tiles`,
    handle: safeHandle(`${sourceImport.sourceName}-${type}`),
    description: `Tiles generated from ${sourceImport.provider} ${sourceImport.sourceName}/${type}.`,
  };
}

export function sourceImportStatusVariant(status: string) {
  switch (status) {
    case "SUCCEEDED":
      return "success" as const;
    case "PROCESSING":
    case "PENDING":
      return "warning" as const;
    case "FAILED":
    case "CANCELED":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export function sourceImportSummary(sourceImport: ConsoleSourceImport) {
  const type = sourceImport.input?.type;
  const featureCount = sourceImport.output?.featureCount;
  const features =
    typeof featureCount === "number"
      ? `${featureCount.toLocaleString()} features`
      : "features pending";
  return `${sourceImport.provider} ${sourceImport.sourceName}${type ? `/${type}` : ""} - ${features}`;
}

function safeHandle(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized || "imported-tileset";
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (match) => match.toUpperCase());
}
