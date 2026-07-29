import { api, type ApiEnvelope } from "@/lib/api";
import type { StudioStyleSummary } from "./style-workflow";
import { clientEnv } from "@/env.client";
import {
  buildStyleTemplate,
  defaultStyleTemplateId,
  type StyleTemplateId,
} from "@/lib/managed-defaults";

export async function createStyle(
  name: string,
  templateId = defaultStyleTemplateId(clientEnv.NEXT_PUBLIC_DEPLOYMENT_MODE),
): Promise<StudioStyleSummary> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Name is required");

  const res = await api.post<ApiEnvelope<StudioStyleSummary>>("/styles", {
    name: trimmedName,
    styleJson: buildStyleTemplate({
      name: trimmedName,
      templateId: templateId as StyleTemplateId,
      apiRoot: clientEnv.NEXT_PUBLIC_API_URL,
    }),
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

export async function publishStyleSummary(
  style: Pick<StudioStyleSummary, "id" | "version">,
) {
  await api.publishStyle(style.id, style.version);
}

export async function unpublishStyleSummary(
  style: Pick<StudioStyleSummary, "id">,
) {
  await api.unpublishStyle(style.id);
}
