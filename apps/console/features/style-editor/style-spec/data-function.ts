export type DataFunctionType =
  | "identity"
  | "categorical"
  | "interval"
  | "exponential";

export function commitDataFunctionStopKey(
  type: DataFunctionType | undefined,
  input: string,
): { ok: true; value: string | number } | { ok: false } {
  if (type !== "interval" && type !== "exponential") {
    return { ok: true, value: input };
  }
  const value = Number(input);
  return Number.isFinite(value) && input.trim() !== ""
    ? { ok: true, value }
    : { ok: false };
}

export function newDataFunctionStopKey(type: DataFunctionType | undefined) {
  return type === "interval" || type === "exponential" ? 0 : "value";
}
