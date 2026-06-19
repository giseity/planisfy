export function isPeliasConfigured(peliasUrl: string | undefined): boolean {
  if (!peliasUrl) return false;

  try {
    const url = new URL(peliasUrl);
    const path = url.pathname.replace(/\/+$/, "");
    return !path.endsWith("/geocoding");
  } catch {
    return false;
  }
}

