import { z } from "zod";
import { apiEnvelopeSchema, nullableStringSchema } from "../primitives";

export const consoleDefaultViewSchema = z.enum([
  "dashboard",
  "styles",
  "operations",
]);

export const consolePreferencesSchema = z.object({
  emailNotificationsEnabled: z.boolean(),
  defaultView: consoleDefaultViewSchema,
});

export const consoleProfileSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string(),
  avatarUrl: nullableStringSchema,
  bio: nullableStringSchema,
  email: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  preferences: consolePreferencesSchema,
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

export const updateConsolePreferencesSchema = consolePreferencesSchema
  .partial()
  .refine(
    (preferences) => Object.keys(preferences).length > 0,
    "At least one preference is required",
  );

export type UpdateConsolePreferencesInput = z.infer<
  typeof updateConsolePreferencesSchema
>;

export const deleteConsoleProfileSchema = z.object({
  confirmation: z.string(),
});

export const consoleProfileEnvelopeSchema = apiEnvelopeSchema(
  consoleProfileSchema,
);
