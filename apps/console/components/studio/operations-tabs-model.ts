import type { ConsoleScheduledOperation } from "@/lib/api";

export function parseJsonObject(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON value must be an object");
  }
  return parsed as Record<string, unknown>;
}

export function schedulePayload(options: {
  executionTargetId: string;
  kind: ConsoleScheduledOperation["kind"];
  payload: string;
  tilesetId: string;
  workerProfileId: string;
}) {
  const parsed = parseJsonObject(options.payload);
  const guided: Record<string, unknown> = {};
  if (options.tilesetId) guided.tilesetId = options.tilesetId;
  if (options.executionTargetId) {
    guided.executionTargetId = options.executionTargetId;
  }
  if (options.workerProfileId) guided.workerProfileId = options.workerProfileId;
  if (options.kind === "tileset_rebuild" && options.tilesetId) {
    guided.resourceType = "tileset";
  }
  return { ...guided, ...parsed };
}

export function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatBytes(value: number | null) {
  if (!value) return "0 B";
  if (value >= 1_073_741_824) return `${(value / 1_073_741_824).toFixed(1)} GB`;
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}
