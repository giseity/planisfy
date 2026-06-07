export function parseStyleHandleVersion(value: string): {
  handle: string;
  version?: number;
  invalidVersion: boolean;
} {
  const [handle, rawVersion] = value.split("@");
  const parsed = rawVersion ? Number(rawVersion) : undefined;
  return {
    handle: handle ?? value,
    version:
      parsed && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined,
    invalidVersion:
      rawVersion !== undefined &&
      (!Number.isInteger(parsed) || Number(parsed) <= 0),
  };
}

export function canReadPublishedStyle(params: {
  isPublic: boolean;
  styleOwnerId: string;
  requestOwnerId?: string;
}) {
  return params.isPublic || params.styleOwnerId === params.requestOwnerId;
}

export function styleCacheControl(isPublic: boolean) {
  return isPublic ? "public, max-age=300" : "private, no-cache";
}

export function styleEtag(styleId: string, version: number) {
  return `"style-${styleId}-v${version}"`;
}
