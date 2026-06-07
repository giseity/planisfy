import type { ProcessingEstimate } from "@/lib/api";

export function runtimeSelectionPayload(
  executionTargetId: string,
  workerProfileId: string,
) {
  return {
    executionTargetId:
      executionTargetId === "default" ? undefined : executionTargetId,
    workerProfileId: workerProfileId === "default" ? undefined : workerProfileId,
  };
}

export function estimateSummary(estimate: ProcessingEstimate) {
  return `${formatDuration(estimate.minSeconds)}-${formatDuration(
    estimate.maxSeconds,
  )} (${estimate.confidence})`;
}

function formatDuration(seconds: number) {
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
