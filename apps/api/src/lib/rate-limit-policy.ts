export function normalizeRequestsPerMinute(value: number) {
  if (!Number.isFinite(value)) return Infinity;
  return Math.max(1, Math.floor(value));
}
