import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  type EncryptedCredentialEnvelope,
} from "@planisfy/credentials";

export type ExecutionTargetProvider = "local" | "aws_batch" | "gcp_batch";
export type ExecutionTargetAuthMode = "federated" | "static" | "external";

export type EstimateConfidence = "low" | "medium" | "high";

export interface ProcessingEstimateInput {
  provider?: ExecutionTargetProvider;
  sourceSizeBytes?: number | null;
  featureCount?: number | null;
  minZoom?: number | null;
  maxZoom?: number | null;
  cpu?: number | null;
  memoryMb?: number | null;
}

export interface ProcessingEstimate {
  minSeconds: number;
  maxSeconds: number;
  confidence: EstimateConfidence;
  basis: string[];
}

const PROVIDER_MULTIPLIER: Record<ExecutionTargetProvider, number> = {
  local: 1.25,
  aws_batch: 1,
  gcp_batch: 1.05,
};

export function encryptExecutionSecret(
  value: string,
  secret: string | undefined,
): EncryptedCredentialEnvelope {
  return encryptCredentialPayload({ value }, secret);
}

export function decryptExecutionSecret(
  envelope: EncryptedCredentialEnvelope,
  secret: string | undefined,
): string {
  const payload = decryptCredentialPayload(envelope, secret);
  return typeof payload.value === "string" ? payload.value : "";
}

export function maskSecretValue(valueSet = true) {
  return valueSet ? "********" : "";
}

export function normalizeEnvName(name: string) {
  return name.trim().toUpperCase();
}

export function estimateProcessingDuration(
  input: ProcessingEstimateInput,
): ProcessingEstimate {
  const minZoom = input.minZoom ?? 0;
  const maxZoom = input.maxZoom ?? 14;
  const zoomLevels = Math.max(1, maxZoom - minZoom + 1);
  const sourceMb = Math.max(1, (input.sourceSizeBytes ?? 0) / (1024 * 1024));
  const features = Math.max(0, input.featureCount ?? 0);
  const featureUnits = features > 0 ? Math.log10(features + 10) * 12 : 0;
  const sizeUnits = Math.log2(sourceMb + 1) * 18;
  const zoomUnits = zoomLevels * zoomLevels * 1.4;
  const cpuMultiplier = input.cpu && input.cpu > 0 ? 1 / Math.sqrt(input.cpu) : 1;
  const memoryMultiplier =
    input.memoryMb && input.memoryMb >= 8192
      ? 0.85
      : input.memoryMb && input.memoryMb < 2048
        ? 1.2
        : 1;
  const providerMultiplier =
    PROVIDER_MULTIPLIER[input.provider ?? "local"] ?? PROVIDER_MULTIPLIER.local;

  const midpoint = Math.max(
    45,
    (35 + sizeUnits + featureUnits + zoomUnits) *
      cpuMultiplier *
      memoryMultiplier *
      providerMultiplier,
  );
  const hasSourceSignal = Boolean(input.sourceSizeBytes || input.featureCount);
  const hasProfileSignal = Boolean(input.cpu || input.memoryMb);
  const spread = hasSourceSignal && hasProfileSignal ? 0.25 : hasSourceSignal ? 0.4 : 0.65;

  return {
    minSeconds: Math.max(10, Math.round(midpoint * (1 - spread))),
    maxSeconds: Math.max(20, Math.round(midpoint * (1 + spread))),
    confidence: hasSourceSignal && hasProfileSignal ? "high" : hasSourceSignal ? "medium" : "low",
    basis: [
      `${zoomLevels} zoom level${zoomLevels === 1 ? "" : "s"}`,
      hasSourceSignal ? "source metadata" : "default source size",
      hasProfileSignal ? "worker profile" : "default worker profile",
      input.provider ?? "local",
    ],
  };
}
