import { api, type ApiEnvelope } from "@/lib/api";
import type { StudioStyleSummary } from "./style-workflow";

function blankStyle(name: string): Record<string, unknown> {
  return {
    version: 8,
    name,
    sources: {},
    layers: [],
  };
}

export async function createStyle(name: string): Promise<StudioStyleSummary> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Name is required");

  const res = await api.post<ApiEnvelope<StudioStyleSummary>>("/styles", {
    name: trimmedName,
    styleJson: blankStyle(trimmedName),
  });

  return res.data;
}

export async function deleteStyle(styleId: string): Promise<void> {
  await api.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
    `/styles/${styleId}`,
  );
}

export async function duplicateStyle(styleId: string): Promise<string> {
  const res = await api.post<ApiEnvelope<StudioStyleSummary>>(
    `/styles/${styleId}/duplicate`,
  );

  return res.data.id;
}

export async function togglePublish(style: Pick<StudioStyleSummary, "id" | "isPublic">) {
  const action = style.isPublic ? "unpublish" : "publish";
  await api.post<ApiEnvelope<unknown>>(`/styles/${style.id}/${action}`);
}
