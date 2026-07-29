export function canonicalStylePaths(params: {
  ownerHandle: string;
  styleHandle: string;
  isPublic: boolean;
  publishedVersion: number | null;
}) {
  const basePath = `/styles/v1/${encodeURIComponent(params.ownerHandle)}/${encodeURIComponent(params.styleHandle)}`;
  return {
    publicPath: params.isPublic ? basePath : null,
    publishedVersionPath:
      params.isPublic && params.publishedVersion !== null
        ? `${basePath}@${params.publishedVersion}`
        : null,
  };
}
