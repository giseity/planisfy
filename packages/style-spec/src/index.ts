import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";

export type JsonObject = Record<string, unknown>;

export interface StyleValidationIssue {
  message: string;
  line?: number;
  identifier?: string;
}

interface MapLibreValidationError {
  message: string;
  line?: number;
  identifier?: string;
}

export interface PublishStyleOptions {
  sourceUrlRewrites?: Record<string, string>;
}

export interface PublishedStyleSnapshot {
  styleJson: JsonObject;
  publishedAt: string;
}

export function validateMapLibreStyle(styleJson: unknown): StyleValidationIssue[] {
  if (!isObject(styleJson)) {
    return [{ message: "Style must be a JSON object" }];
  }

  const errors = validateStyleMin(styleJson as never) as MapLibreValidationError[];
  return errors.map((error) => ({
    message: error.message,
    line: typeof error.line === "number" ? error.line : undefined,
    identifier: typeof error.identifier === "string" ? error.identifier : undefined,
  }));
}

export function assertValidMapLibreStyle(styleJson: unknown): asserts styleJson is JsonObject {
  const issues = validateMapLibreStyle(styleJson);
  if (issues.length > 0) {
    throw new StyleValidationError(issues);
  }
}

export class StyleValidationError extends Error {
  constructor(readonly issues: StyleValidationIssue[]) {
    super(`Invalid MapLibre style: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "StyleValidationError";
  }
}

export function createPublishedStyleSnapshot(
  draftStyleJson: unknown,
  options: PublishStyleOptions = {},
): PublishedStyleSnapshot {
  assertValidMapLibreStyle(draftStyleJson);
  const styleJson = deepClone(draftStyleJson);

  if (options.sourceUrlRewrites) {
    rewriteSourceUrls(styleJson, options.sourceUrlRewrites);
  }

  return {
    styleJson,
    publishedAt: new Date().toISOString(),
  };
}

export function rewriteSourceUrls(
  styleJson: JsonObject,
  sourceUrlRewrites: Record<string, string>,
): JsonObject {
  if (!isObject(styleJson.sources)) {
    return styleJson;
  }

  for (const [sourceId, source] of Object.entries(styleJson.sources)) {
    if (!isObject(source)) continue;
    const nextUrl = sourceUrlRewrites[sourceId];
    if (nextUrl) {
      source.url = nextUrl;
    }
  }

  return styleJson;
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
