import { z } from "zod";
import {
  UnsupportedOvertureTypeError,
  validateOvertureThemeType,
} from "./overture-catalog";

export const sourceImportHandleSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const overtureImportRequestSchema = z.object({
  handle: sourceImportHandleSchema,
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  regionId: z.string().uuid(),
  sourceConnectionId: z.string().uuid().optional(),
  theme: z.string().min(1).max(64),
  type: z.string().min(1).max(64).optional(),
});

export type OvertureImportRequest = z.infer<typeof overtureImportRequestSchema>;

export type OvertureReleaseReadiness =
  | { ok: true; release: string }
  | { ok: false; code: "OVERTURE_RELEASE_NOT_CONFIGURED"; message: string };

export function parseOvertureImportRequest(
  input: unknown,
  options: { allowExperimental?: boolean } = {},
) {
  const parsed = overtureImportRequestSchema.safeParse(input);
  if (!parsed.success) return parsed;

  try {
    return {
      success: true as const,
      data: parsed.data,
      catalogEntry: validateOvertureThemeType({
        theme: parsed.data.theme,
        type: parsed.data.type,
        allowExperimental: options.allowExperimental,
      }),
    };
  } catch (err) {
    if (err instanceof UnsupportedOvertureTypeError) {
      return {
        success: false as const,
        error: err,
        reason: "unsupported-overture-type" as const,
      };
    }
    throw err;
  }
}

export function assertOvertureReleaseConfigured(
  release: string | null | undefined,
): OvertureReleaseReadiness {
  const value = release?.trim();
  if (value) return { ok: true, release: value };
  return {
    ok: false,
    code: "OVERTURE_RELEASE_NOT_CONFIGURED",
    message:
      "OVERTURE_RELEASE is required before DuckDB-backed Overture imports can be queued.",
  };
}
