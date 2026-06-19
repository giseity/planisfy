export function parseContentLength(headers: Headers): number | null {
  const raw = headers.get("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function isRequestBodyTooLarge(
  headers: Headers,
  maxBytes: number,
): boolean {
  const contentLength = parseContentLength(headers);
  return contentLength !== null && contentLength > maxBytes;
}
