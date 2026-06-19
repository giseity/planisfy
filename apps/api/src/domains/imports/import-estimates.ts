export type BBox = [number, number, number, number];

export type ImportRiskLevel = "low" | "medium" | "high";

export interface OvertureImportEstimate {
  bbox: BBox;
  approximateAreaKm2: number;
  durationEstimateSeconds: { min: number; max: number };
  riskLevel: ImportRiskLevel;
  warnings: string[];
  safeguards: {
    maxFeatures: number;
    timeoutMs: number;
    requiresCancellationCheckpoints: boolean;
  };
}

const EARTH_RADIUS_KM = 6371.0088;

export function buildOvertureImportEstimate(params: {
  bbox: unknown;
  maxFeatures: number;
  timeoutMs: number;
}): OvertureImportEstimate {
  const bbox = coerceBBox(params.bbox);
  const approximateAreaKm2 = Math.round(bboxAreaKm2(bbox));
  const riskLevel = riskForArea(approximateAreaKm2);
  const warnings = warningsForEstimate({
    approximateAreaKm2,
    timeoutMs: params.timeoutMs,
    maxFeatures: params.maxFeatures,
  });

  return {
    bbox,
    approximateAreaKm2,
    durationEstimateSeconds: durationEstimateForArea(approximateAreaKm2),
    riskLevel,
    warnings,
    safeguards: {
      maxFeatures: params.maxFeatures,
      timeoutMs: params.timeoutMs,
      requiresCancellationCheckpoints: approximateAreaKm2 >= 10_000,
    },
  };
}

export function coerceBBox(value: unknown): BBox {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("Saved region bbox must be [west, south, east, north]");
  }
  const bbox = value.map(Number) as BBox;
  const [west, south, east, north] = bbox;
  if (
    !bbox.every(Number.isFinite) ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new Error("Saved region bbox is outside valid WGS84 bounds");
  }
  return bbox;
}

function bboxAreaKm2([west, south, east, north]: BBox) {
  const westRad = toRadians(west);
  const eastRad = toRadians(east);
  const southRad = toRadians(south);
  const northRad = toRadians(north);
  return (
    EARTH_RADIUS_KM ** 2 *
    Math.abs(eastRad - westRad) *
    Math.abs(Math.sin(northRad) - Math.sin(southRad))
  );
}

function durationEstimateForArea(areaKm2: number) {
  if (areaKm2 < 500) return { min: 30, max: 180 };
  if (areaKm2 < 10_000) return { min: 180, max: 900 };
  if (areaKm2 < 100_000) return { min: 900, max: 3600 };
  return { min: 3600, max: 14_400 };
}

function riskForArea(areaKm2: number): ImportRiskLevel {
  if (areaKm2 < 500) return "low";
  if (areaKm2 < 10_000) return "medium";
  return "high";
}

function warningsForEstimate(params: {
  approximateAreaKm2: number;
  maxFeatures: number;
  timeoutMs: number;
}) {
  const warnings: string[] = [];
  if (params.approximateAreaKm2 >= 10_000) {
    warnings.push(
      "Large region import: review feature limits, temp space, and cancellation behavior before running.",
    );
  }
  if (params.maxFeatures <= 0) {
    warnings.push("SOURCE_IMPORT_MAX_FEATURES is disabled or invalid.");
  }
  if (params.timeoutMs < 60_000) {
    warnings.push("SOURCE_IMPORT_TIMEOUT_MS is shorter than one minute.");
  }
  return warnings;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
