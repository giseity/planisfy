import { z } from "zod";
import {
  apiEnvelopeSchema,
  boundedDaysQuerySchema,
  isoDateStringSchema,
  jsonRecordSchema,
  nullableStringSchema,
  paginatedApiEnvelopeSchema,
  positivePaginationQuerySchema,
} from "../primitives";

export const usageDaysQuerySchema = boundedDaysQuerySchema;
export const usageLogsQuerySchema = positivePaginationQuerySchema;

export const usageRetentionSchema = z.object({
  days: z.number().int().positive(),
  oldestAt: z.string(),
  newestAt: z.string(),
});

export const usageSummarySchema = z.object({
  totalRequests: z.number(),
  totalUnits: z.number(),
  activeApiKeys: z.number(),
  plan: z.object({
    id: z.string(),
    name: z.string(),
    limits: jsonRecordSchema,
  }),
  quota: z.object({
    used: z.number(),
    limit: z.number().nullable(),
    remaining: z.number().nullable(),
    percent: z.number(),
    periodStart: z.string(),
    periodEnd: z.string(),
  }),
  previousPeriod: z.object({
    totalRequests: z.number(),
    totalUnits: z.number(),
  }),
  retention: usageRetentionSchema,
});

export type UsageSummary = z.infer<typeof usageSummarySchema>;

export const usageTimeseriesPointSchema = z.object({
  date: isoDateStringSchema,
  tiles: z.number(),
  styles: z.number(),
  geocoding: z.number(),
  directions: z.number(),
  elevation: z.number(),
  static: z.number(),
  other: z.number(),
  total: z.number(),
});

export type UsageTimeseriesPoint = z.infer<typeof usageTimeseriesPointSchema>;

export const usageByKeySchema = z.object({
  apiKeyId: nullableStringSchema,
  name: z.string(),
  requests: z.number(),
  units: z.number(),
});

export type UsageByKey = z.infer<typeof usageByKeySchema>;

export const usageByEndpointSchema = z.object({
  endpoint: z.string(),
  method: z.string(),
  requests: z.number(),
  units: z.number(),
  successCount: z.number(),
  errorCount: z.number(),
});

export type UsageByEndpoint = z.infer<typeof usageByEndpointSchema>;

export const usageLogSchema = z.object({
  id: z.string(),
  apiKeyId: nullableStringSchema,
  endpoint: z.string(),
  method: z.string(),
  statusCode: z.number(),
  cost: z.number(),
  ipAddress: nullableStringSchema,
  timestamp: z.union([z.string(), z.date()]),
});

export type UsageLog = z.infer<typeof usageLogSchema>;

export const usageSummaryEnvelopeSchema = apiEnvelopeSchema(usageSummarySchema);
export const usageTimeseriesEnvelopeSchema = apiEnvelopeSchema(
  z.array(usageTimeseriesPointSchema),
);
export const usageByKeyEnvelopeSchema = apiEnvelopeSchema(
  z.array(usageByKeySchema),
);
export const usageByEndpointEnvelopeSchema = apiEnvelopeSchema(
  z.array(usageByEndpointSchema),
);
export const usageLogsEnvelopeSchema = paginatedApiEnvelopeSchema(
  z.array(usageLogSchema),
).extend({
  retention: usageRetentionSchema,
});
