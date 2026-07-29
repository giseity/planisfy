import type { ApiEnvelope } from "@/lib/api";
import type { ConsoleStyleDetail } from "@planisfy/api-contracts";
import { CONSOLE_API_BASE } from "@/lib/console-api/config";
import {
  ApiRequestError,
  type ApiError,
} from "@/lib/console-api/errors";
export type StyleDetailResponse = ConsoleStyleDetail & {
  serverVersion?: number;
};

export async function fetchStyleDetail(
  id: string,
  signal: AbortSignal,
  version?: number,
): Promise<StyleDetailResponse> {
  const path =
    version === undefined
      ? `/styles/${id}`
      : `/styles/${id}/versions/${version}`;
  const response = await fetch(`${CONSOLE_API_BASE}${path}`, {
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
