import type { ApiEnvelope } from "@/lib/api";
import { CONSOLE_API_BASE } from "@/lib/console-api/config";
import {
  ApiRequestError,
  type ApiError,
} from "@/lib/console-api/errors";
import type { StyleSpecification } from "maplibre-gl";

export interface StyleDetailResponse {
  styleJson: StyleSpecification;
  version: number;
  id: string;
  handle?: string;
  isPublic?: boolean;
  publishedVersion?: number | null;
}

export async function fetchStyleDetail(
  id: string,
  signal: AbortSignal,
): Promise<StyleDetailResponse> {
  const response = await fetch(`${CONSOLE_API_BASE}/styles/${id}`, {
    credentials: "include",
    signal,
  });
  const json = (await response.json()) as
    | ApiEnvelope<StyleDetailResponse>
    | ApiError;
  if (!response.ok || !("data" in json)) {
    const error = json as ApiError;
    throw new ApiRequestError(
      error.error?.message || response.statusText,
      response.status,
      error.error?.code || "UNKNOWN",
      error.error?.details,
    );
  }
  return json.data;
}
