import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type BBox = [number, number, number, number];

export interface OvertureImportInput {
  provider: "OVERTURE";
  datasetId: string;
  regionId: string;
  bbox: BBox;
  sourceConnectionId?: string;
  theme: string;
  type?: string;
}

export interface OvertureImportPlan {
  sourceUrl: string;
  outputPath: string;
  metadataPath: string;
  schemaPath: string;
  sql: string;
  provenance: {
    provider: "OVERTURE";
    release: string;
    sourceUrl: string;
    theme: string;
    type?: string;
    bbox: BBox;
    maxFeatures: number;
  };
}

export interface OvertureImportResult {
  data: Buffer;
  featureCount: number;
  bounds: BBox | null;
  schemaSummary: Record<string, unknown>;
  warnings: string[];
  provenance: OvertureImportPlan["provenance"];
}

export interface OvertureImportOptions {
  duckdbPath: string;
  release?: string;
  parquetUrlTemplate: string;
  maxFeatures: number;
  timeoutMs: number;
}

export function parseOvertureImportInput(input: unknown): OvertureImportInput {
  if (typeof input !== "object" || input === null) {
    throw new Error("Source import input is missing");
  }

  const candidate = input as Partial<OvertureImportInput>;
  if (candidate.provider !== "OVERTURE") {
    throw new Error("Only Overture imports are supported by this worker");
  }
  if (!candidate.datasetId || !candidate.regionId || !candidate.theme) {
    throw new Error("Overture import input is incomplete");
  }
  if (!isBBox(candidate.bbox)) {
    throw new Error("Overture import input requires bbox [west,south,east,north]");
  }

  return {
    provider: "OVERTURE",
    datasetId: candidate.datasetId,
    regionId: candidate.regionId,
    bbox: candidate.bbox,
    sourceConnectionId: candidate.sourceConnectionId,
    theme: candidate.theme,
    type: candidate.type,
  };
}

export async function runOvertureImport(
  input: OvertureImportInput,
  options: OvertureImportOptions,
): Promise<OvertureImportResult> {
  const workDir = await mkdtemp(join(tmpdir(), "planisfy-overture-"));
  const outputPath = join(workDir, "features.geojson");
  const metadataPath = join(workDir, "metadata.json");
  const schemaPath = join(workDir, "schema.json");
  const plan = buildOvertureImportPlan(input, options, {
    outputPath,
    metadataPath,
    schemaPath,
  });

  try {
    await execFileAsync(options.duckdbPath, ["-batch", ":memory:", "-c", plan.sql], {
      timeout: options.timeoutMs,
      maxBuffer: 1024 * 1024 * 16,
    });

    const [data, metadataRaw, schemaRaw] = await Promise.all([
      readFile(outputPath),
      readFile(metadataPath, "utf-8"),
      readFile(schemaPath, "utf-8"),
    ]);
    const metadata = parseFirstJsonRow(metadataRaw);
    const schemaRows = parseJsonRows(schemaRaw);

    return {
      data,
      featureCount: Number(metadata.featureCount ?? 0),
      bounds: boundsFromMetadata(metadata),
      schemaSummary: {
        provider: "OVERTURE",
        release: plan.provenance.release,
        theme: input.theme,
        type: input.type,
        format: "GeoJSON",
        columns: schemaRows,
      },
      warnings:
        Number(metadata.featureCount ?? 0) >= options.maxFeatures
          ? [`Import reached SOURCE_IMPORT_MAX_FEATURES=${options.maxFeatures}`]
          : [],
      provenance: plan.provenance,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function buildOvertureImportPlan(
  input: OvertureImportInput,
  options: OvertureImportOptions,
  paths: {
    outputPath: string;
    metadataPath: string;
    schemaPath: string;
  },
): OvertureImportPlan {
  const release = options.release;
  if (!release) {
    throw new Error("OVERTURE_RELEASE is required for DuckDB Overture imports");
  }

  const sourceUrl = buildOvertureSourceUrl({
    template: options.parquetUrlTemplate,
    release,
    theme: input.theme,
    type: input.type,
  });
  const [west, south, east, north] = input.bbox;
  const quotedUrl = sqlString(sourceUrl);
  const outputPath = sqlString(toDuckDbPath(paths.outputPath));
  const metadataPath = sqlString(toDuckDbPath(paths.metadataPath));
  const schemaPath = sqlString(toDuckDbPath(paths.schemaPath));

  return {
    sourceUrl,
    outputPath: paths.outputPath,
    metadataPath: paths.metadataPath,
    schemaPath: paths.schemaPath,
    provenance: {
      provider: "OVERTURE",
      release,
      sourceUrl,
      theme: input.theme,
      type: input.type,
      bbox: input.bbox,
      maxFeatures: options.maxFeatures,
    },
    sql: [
      "INSTALL httpfs;",
      "LOAD httpfs;",
      "INSTALL spatial;",
      "LOAD spatial;",
      "SET s3_region='us-west-2';",
      "SET s3_url_style='path';",
      "SET s3_endpoint='s3.us-west-2.amazonaws.com';",
      "SET s3_use_ssl=true;",
      "CREATE TEMP VIEW filtered_overture AS",
      "SELECT *",
      `FROM read_parquet(${quotedUrl}, hive_partitioning = true)`,
      `WHERE bbox.xmin <= ${east}`,
      `  AND bbox.xmax >= ${west}`,
      `  AND bbox.ymin <= ${north}`,
      `  AND bbox.ymax >= ${south}`,
      `LIMIT ${options.maxFeatures};`,
      "COPY (",
      "  SELECT * EXCLUDE (geometry), ST_AsGeoJSON(geometry)::JSON AS geometry",
      "  FROM filtered_overture",
      `) TO ${outputPath} WITH (FORMAT GDAL, DRIVER 'GeoJSON');`,
      "COPY (",
      "  SELECT",
      "    count(*)::BIGINT AS featureCount,",
      "    min(bbox.xmin) AS west,",
      "    min(bbox.ymin) AS south,",
      "    max(bbox.xmax) AS east,",
      "    max(bbox.ymax) AS north",
      "  FROM filtered_overture",
      `) TO ${metadataPath} (FORMAT JSON, ARRAY true);`,
      `COPY (DESCRIBE filtered_overture) TO ${schemaPath} (FORMAT JSON, ARRAY true);`,
    ].join("\n"),
  };
}

export function buildOvertureSourceUrl(params: {
  template: string;
  release: string;
  theme: string;
  type?: string;
}) {
  if (params.template.includes("{type}") && !params.type) {
    throw new Error("Overture import type is required by OVERTURE_PARQUET_URL_TEMPLATE");
  }

  return params.template
    .replaceAll("{release}", encodeTemplateSegment(params.release))
    .replaceAll("{theme}", encodeTemplateSegment(params.theme))
    .replaceAll("{type}", encodeTemplateSegment(params.type ?? ""));
}

function isBBox(value: unknown): value is BBox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part)) &&
    value[0]! < value[2]! &&
    value[1]! < value[3]!
  );
}

function encodeTemplateSegment(value: string) {
  if (!/^[A-Za-z0-9._=-]+$/.test(value)) {
    throw new Error(`Unsafe Overture URL template value: ${value}`);
  }
  return value;
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function toDuckDbPath(path: string) {
  return path.replaceAll("\\", "/");
}

function parseFirstJsonRow(raw: string): Record<string, unknown> {
  const rows = parseJsonRows(raw);
  const first = rows[0];
  return typeof first === "object" && first !== null
    ? (first as Record<string, unknown>)
    : {};
}

function parseJsonRows(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function boundsFromMetadata(metadata: Record<string, unknown>): BBox | null {
  const bounds = [
    metadata.west,
    metadata.south,
    metadata.east,
    metadata.north,
  ];
  if (bounds.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return bounds as BBox;
  }
  return null;
}
