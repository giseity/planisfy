export interface StudioStyleSummary {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  isPublic: boolean;
  thumbnailUrl: string | null;
  version: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export function styleEditorHref(style: Pick<StudioStyleSummary, "id">) {
  return `/styles/${style.id}`;
}

export function styleDetailHref(style: Pick<StudioStyleSummary, "id">) {
  return `/styles/${style.id}/details`;
}

export function formatStyleUpdatedAt(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(date).toLocaleDateString();
}

export function stylePublicUrl(params: {
  origin: string;
  ownerHandle: string;
  style: Pick<StudioStyleSummary, "handle">;
}) {
  return `${params.origin.replace(/\/$/, "")}/styles/v1/${params.ownerHandle}/${params.style.handle}`;
}

export function mapLibreEmbedSnippet(params: {
  styleUrl: string;
  container?: string;
  center?: [number, number];
  zoom?: number;
}) {
  const container = params.container ?? "map";
  const center = params.center ?? [0, 0];
  const zoom = params.zoom ?? 2;

  return `const map = new maplibregl.Map({
  container: "${container}",
  style: "${params.styleUrl}",
  center: [${center[0]}, ${center[1]}],
  zoom: ${zoom}
});`;
}

export function styleJsonFilename(style: Pick<StudioStyleSummary, "name">) {
  return `${style.name || "style"}.json`;
}
