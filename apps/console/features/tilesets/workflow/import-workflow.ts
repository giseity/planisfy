import type {
  ConsoleSourceImport,
  OvertureCatalogTheme,
  OvertureCatalogType,
} from "@/lib/api";

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

export function catalogTypesForTheme(
  catalog: OvertureCatalogTheme[],
  theme: string,
) {
  return catalog.find((entry) => entry.theme === theme)?.types ?? [];
}

export function catalogTypeForSelection(
  catalog: OvertureCatalogTheme[],
  theme: string,
  type: string,
): OvertureCatalogType | null {
  return (
    catalogTypesForTheme(catalog, theme).find((entry) => entry.type === type) ??
    null
  );
}

export function defaultOvertureImportOptions(
  catalog: OvertureCatalogTheme[],
  theme: string,
  type: string,
) {
  const entry = catalogTypeForSelection(catalog, theme, type);
  const label = entry?.label ?? titleCase(type.replaceAll("_", " "));
  const themeLabel =
    catalog.find((candidate) => candidate.theme === theme)?.label ??
    titleCase(theme.replaceAll("_", " "));

  return {
    name: `Overture ${label}`,
    handle: safeHandle(`overture-${theme}-${type}`),
    description: `DuckDB import of Overture ${themeLabel} ${label}.`,
  };
}

export function canRequestOvertureImport(params: {
  theme: string;
  type: string;
  name: string;
  handle: string;
  regionReady: boolean;
}) {
  return Boolean(
    params.theme &&
      params.type &&
      params.name.trim() &&
      params.handle.trim() &&
      params.regionReady,
  );
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
