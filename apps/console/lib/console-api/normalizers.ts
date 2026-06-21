import type {
  ConsoleDashboard,
  ConsoleProfile,
  ConsoleSpriteAsset,
  ConsoleTileset,
} from "@planisfy/api-contracts";
import { API_ROOT, CONSOLE_API_BASE } from "./config";

export function normalizeTilesetUrls(tileset: ConsoleTileset): ConsoleTileset {
  return {
    ...tileset,
    tilejsonUrl: normalizeApiUrl(tileset.tilejsonUrl),
    versionedTilejsonUrl: normalizeApiUrl(tileset.versionedTilejsonUrl),
  };
}

export function normalizeDashboardUrls(
  dashboard: ConsoleDashboard,
): ConsoleDashboard {
  return {
    ...dashboard,
    resources: {
      ...dashboard.resources,
      recentStyles: dashboard.resources.recentStyles.map((style) => ({
        ...style,
        publicUrl: normalizeApiUrl(style.publicUrl),
      })),
      recentTilesets: dashboard.resources.recentTilesets.map((tileset) => ({
        ...tileset,
        tilejsonUrl: normalizeApiUrl(tileset.tilejsonUrl),
        versionedTilejsonUrl: normalizeApiUrl(tileset.versionedTilejsonUrl),
      })),
    },
    integration: {
      ...dashboard.integration,
      publicStyleUrl: normalizeApiUrl(dashboard.integration.publicStyleUrl),
      tilejsonUrl: normalizeApiUrl(dashboard.integration.tilejsonUrl),
      mapLibreSnippet:
        dashboard.integration.publicStyleUrl &&
        dashboard.integration.tilejsonUrl
          ? `new maplibregl.Map({\n  container: "map",\n  style: "${normalizeApiUrl(dashboard.integration.publicStyleUrl)}"\n});`
          : dashboard.integration.mapLibreSnippet,
      curlSnippet: dashboard.integration.tilejsonUrl
        ? `curl "${normalizeApiUrl(dashboard.integration.tilejsonUrl)}"`
        : dashboard.integration.curlSnippet,
    },
  };
}

export function normalizeApiUrl(url: string | null) {
  if (!url || /^https?:\/\//.test(url)) return url;
  return `${API_ROOT}${url.startsWith("/") ? url : `/${url}`}`;
}

export function normalizeSpriteAssetPreviewUrl(
  asset: ConsoleSpriteAsset,
): ConsoleSpriteAsset {
  if (/^https?:\/\//.test(asset.previewUrl)) return asset;
  const path = asset.previewUrl.replace(/^\/console/, "");
  return { ...asset, previewUrl: `${CONSOLE_API_BASE}${path}` };
}

export function normalizeProfileAvatarUrl(
  profile: ConsoleProfile,
): ConsoleProfile {
  return {
    ...profile,
    avatarUrl: normalizeConsoleUrl(profile.avatarUrl),
  };
}

export function normalizeConsoleUrl(url: string | null) {
  if (!url || /^https?:\/\//.test(url)) return url;
  if (url.startsWith(CONSOLE_API_BASE)) return url;
  const path = url.replace(/^\/console/, "");
  return `${CONSOLE_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
