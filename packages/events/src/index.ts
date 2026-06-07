import { z } from "zod";

const uuid = z.string().uuid();
const nonEmptyString = z.string().min(1);
const jsonRecord = z.record(z.string(), z.unknown());
const optionalJsonRecord = jsonRecord.optional();

export const uploadCreatedPayloadSchema = z
  .object({
    uploadId: uuid,
    accountId: uuid,
    storageObjectId: uuid,
  })
  .strict();

export const uploadValidatedPayloadSchema = z
  .object({
    uploadId: uuid,
    accountId: uuid,
    valid: z.boolean(),
  })
  .strict();

export const datasetNormalizedPayloadSchema = z
  .object({
    datasetId: uuid,
    accountId: uuid,
    uploadId: uuid.optional(),
  })
  .strict();

export const sourceImportRequestedPayloadSchema = z
  .object({
    importId: uuid,
    accountId: uuid,
    jobId: uuid,
    datasetId: uuid,
    provider: z.enum(["OVERTURE", "NATURAL_EARTH", "CUSTOM"]),
  })
  .strict();

export const tilesetBuildRequestedPayloadSchema = z
  .object({
    tilesetId: uuid,
    accountId: uuid,
    jobId: uuid,
    sourceResourceType: z.enum(["upload", "dataset", "external"]),
    sourceResourceId: uuid,
    options: optionalJsonRecord,
  })
  .strict();

export const tilesetBuildCompletedPayloadSchema = z
  .object({
    tilesetId: uuid,
    accountId: uuid,
    jobId: uuid,
    tilesetVersionId: uuid,
  })
  .strict();

export const tilesetBuildFailedPayloadSchema = z
  .object({
    tilesetId: uuid,
    accountId: uuid,
    jobId: uuid,
    errorCode: nonEmptyString,
    message: nonEmptyString,
  })
  .strict();

export const tilesetVersionPublishedPayloadSchema = z
  .object({
    tilesetId: uuid,
    tilesetVersionId: uuid,
    accountId: uuid,
    publishedBy: uuid,
  })
  .strict();

export const stylePublishRequestedPayloadSchema = z
  .object({
    styleId: uuid,
    accountId: uuid,
    requestedBy: uuid,
  })
  .strict();

export const basemapReleaseRequestedPayloadSchema = z
  .object({
    releaseId: uuid,
    name: nonEmptyString,
    version: nonEmptyString,
  })
  .strict();

export const basemapReleaseCompletedPayloadSchema = z
  .object({
    releaseId: uuid,
    name: nonEmptyString,
    version: nonEmptyString,
    manifestStorageObjectId: uuid,
    artifactStorageObjectId: uuid,
  })
  .strict();

export const usageRollupRequestedPayloadSchema = z
  .object({
    accountId: uuid.optional(),
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .strict();

export const scheduledOperationRunRequestedPayloadSchema = z
  .object({
    scheduleId: uuid,
    accountId: uuid,
    kind: z.enum(["tileset_rebuild", "source_import", "custom_command"]),
    payload: jsonRecord,
    requestedAt: z.string().datetime(),
  })
  .strict();

export const artifactCleanupRequestedPayloadSchema = z
  .object({
    storageObjectId: uuid.optional(),
    resourceType: nonEmptyString.optional(),
    resourceId: uuid.optional(),
    reason: nonEmptyString,
  })
  .strict()
  .refine((value) => value.storageObjectId || (value.resourceType && value.resourceId), {
    message: "Provide storageObjectId or resourceType/resourceId",
  });

export const eventPayloadSchemas = {
  "upload.created": uploadCreatedPayloadSchema,
  "upload.validated": uploadValidatedPayloadSchema,
  "dataset.normalized": datasetNormalizedPayloadSchema,
  "source.import.requested": sourceImportRequestedPayloadSchema,
  "tileset.build.requested": tilesetBuildRequestedPayloadSchema,
  "tileset.build.completed": tilesetBuildCompletedPayloadSchema,
  "tileset.build.failed": tilesetBuildFailedPayloadSchema,
  "tileset.version.published": tilesetVersionPublishedPayloadSchema,
  "style.publish.requested": stylePublishRequestedPayloadSchema,
  "basemap.release.requested": basemapReleaseRequestedPayloadSchema,
  "basemap.release.completed": basemapReleaseCompletedPayloadSchema,
  "usage.rollup.requested": usageRollupRequestedPayloadSchema,
  "scheduled_operation.run_requested": scheduledOperationRunRequestedPayloadSchema,
  "artifact.cleanup.requested": artifactCleanupRequestedPayloadSchema,
} as const;

export type EventName = keyof typeof eventPayloadSchemas;
export type EventPayload<N extends EventName> = z.infer<(typeof eventPayloadSchemas)[N]>;

export function isKnownEventName(eventName: string): eventName is EventName {
  return eventName in eventPayloadSchemas;
}

export class UnknownEventNameError extends Error {
  constructor(readonly eventName: string) {
    super(`Unknown event name: ${eventName}`);
    this.name = "UnknownEventNameError";
  }
}

export class EventPayloadValidationError extends Error {
  constructor(
    readonly eventName: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    super(`Invalid payload for ${eventName}: ${formatZodIssues(issues)}`);
    this.name = "EventPayloadValidationError";
  }
}

export function formatZodIssues(issues: z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseEventPayload<N extends EventName>(
  eventName: N,
  payload: unknown,
): EventPayload<N>;
export function parseEventPayload(eventName: string, payload: unknown): unknown;
export function parseEventPayload(eventName: string, payload: unknown): unknown {
  if (!isKnownEventName(eventName)) {
    throw new UnknownEventNameError(eventName);
  }

  const result = eventPayloadSchemas[eventName].safeParse(payload);
  if (!result.success) {
    throw new EventPayloadValidationError(eventName, result.error.issues);
  }

  return result.data;
}
