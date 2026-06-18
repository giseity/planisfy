import { z } from "zod";
import {
  isoDateTimeStringSchema,
  nullableStringSchema,
  paginatedApiEnvelopeSchema,
  positivePaginationQuerySchema,
} from "../primitives";

export const auditQuerySchema = positivePaginationQuerySchema.extend({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  from: isoDateTimeStringSchema.optional(),
  to: isoDateTimeStringSchema.optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: nullableStringSchema,
  metadata: z.unknown(),
  ipAddress: nullableStringSchema,
  timestamp: z.union([z.string(), z.date()]),
  actorName: nullableStringSchema,
});

export type ConsoleAuditEvent = z.infer<typeof auditEventSchema>;

export const auditEventsEnvelopeSchema = paginatedApiEnvelopeSchema(
  z.array(auditEventSchema),
);
