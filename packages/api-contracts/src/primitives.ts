import { z } from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
    issues: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const paginationSchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative().optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function apiEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({ data });
}

export interface ApiEnvelope<T> {
  data: T;
}

export function paginatedApiEnvelopeSchema<T extends z.ZodType>(data: T) {
  return apiEnvelopeSchema(data).extend({
    pagination: paginationSchema,
  });
}

export interface PaginatedApiEnvelope<T> extends ApiEnvelope<T> {
  pagination: Pagination;
}

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const positivePaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const boundedDaysQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export const isoDateTimeStringSchema = z.string().datetime();
export const isoDateStringSchema = z.string();
export const nullableStringSchema = z.string().nullable();
export const jsonRecordSchema = z.record(z.string(), z.unknown());
