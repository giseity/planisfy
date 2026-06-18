import { z } from "zod";
import { apiEnvelopeSchema, nullableStringSchema } from "../primitives";

export const consoleProfileSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string(),
  avatarUrl: nullableStringSchema,
  bio: nullableStringSchema,
  email: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});

export type ConsoleProfile = z.infer<typeof consoleProfileSchema>;

export const updateConsoleProfileSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  handle: z
    .string()
    .min(2)
    .max(64)
    .regex(
      /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/,
      "Handle must be lowercase alphanumeric with hyphens or underscores",
    )
    .optional(),
  bio: z.string().max(500).optional(),
});

export type UpdateConsoleProfileInput = z.infer<
  typeof updateConsoleProfileSchema
>;

export const deleteConsoleProfileSchema = z.object({
  confirmation: z.string(),
});

export const consoleProfileEnvelopeSchema = apiEnvelopeSchema(
  consoleProfileSchema,
);
