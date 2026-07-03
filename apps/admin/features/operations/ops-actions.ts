"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm"
import {
  artifactBackups,
  db,
  eventOutbox,
  previewLinks,
  processingJobLogs,
  processingJobs,
  scheduledOperations,
  storageObjects,
  tilesets,
  uploads,
  workflowTemplates,
} from "@planisfy/database"
import { parseEventPayload } from "@planisfy/events"
import {
  buildRetrySourceResource,
  parseSourceProcessingJobInput,
} from "@planisfy/geodata-contracts"
import { requireAdmin } from "@/features/auth/admin-auth"
import { isStaleProcessing, staleOutboxCutoff } from "@/features/operations/ops"

function requireString(formData: FormData, key: string) {
  const value = formData.get(key)
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${key}`)
  }
  return value
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function requireJsonObject(formData: FormData, key: string) {
  const raw = requireString(formData, key)
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${key} must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function requireTemplateString(values: Record<string, unknown>, key: string) {
  const value = stringValue(values[key])
  if (!value) throw new Error(`Template ${key} is required`)
  return value
}

function scheduleKindValue(value: unknown) {
  return value === "tileset_rebuild" ||
    value === "source_import" ||
    value === "custom_command"
    ? value
    : "source_import"
}

function scheduleStatusValue(value: unknown) {
  return value === "paused" ? "paused" : "active"
}

async function loadStorage() {
  const { getStorage } = await import("@planisfy/storage")
  return getStorage()
}

function revalidateOpsPaths(...paths: string[]) {
  revalidatePath("/failures")
  for (const path of paths) revalidatePath(path)
}

export async function createArtifactBackupAction(formData: FormData) {
  await requireAdmin()
  const storageObjectId = requireString(formData, "storageObjectId")

  const [object] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.id, storageObjectId), isNull(storageObjects.deletedAt)))
    .limit(1)

  if (!object) throw new Error("Storage object not found")
  if (!object.accountId) throw new Error("Storage object is not account-scoped")

  const storage = await loadStorage()
  const storageInfo = storage.getInfo()
  const backupKey = `backups/${object.accountId}/${object.id}/${Date.now()}-${object.fileName ?? "artifact"}`

  const [backup] = await db.insert(artifactBackups).values({
    accountId: object.accountId,
    storageObjectId: object.id,
    provider: storageInfo.provider,
    bucket: storageInfo.bucket,
    sourceStorageKey: object.storageKey,
    backupStorageKey: backupKey,
    size: object.size,
    metadata: {
      resourceType: object.resourceType,
      resourceId: object.resourceId,
      requestedBy: "admin",
    },
  }).returning()

  try {
    await storage.copy(object.storageKey, backup!.backupStorageKey)
    await db
      .update(artifactBackups)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(artifactBackups.id, backup!.id))
  } catch (err) {
    await db
      .update(artifactBackups)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Backup copy failed",
        completedAt: new Date(),
      })
      .where(eq(artifactBackups.id, backup!.id))
    throw err
  }

  revalidateOpsPaths("/backups", "/artifacts")
}

export async function restoreArtifactBackupAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")

  const [backup] = await db
    .select()
    .from(artifactBackups)
    .where(eq(artifactBackups.id, id))
    .limit(1)

  if (!backup) throw new Error("Backup not found")
  if (backup.status !== "completed" && backup.status !== "restored") {
    throw new Error("Backup is not restorable")
  }

  const storage = await loadStorage()
  await storage.copy(backup.backupStorageKey, backup.sourceStorageKey)
  await db
    .update(artifactBackups)
    .set({ status: "restored", restoredAt: new Date() })
    .where(and(eq(artifactBackups.id, id), inArray(artifactBackups.status, ["completed", "restored"])))

  revalidateOpsPaths("/backups", "/artifacts")
}

export async function createWorkflowTemplateAction(formData: FormData) {
  await requireAdmin()
  const accountId = requireString(formData, "accountId")
  const name = requireString(formData, "name")
  const category = requireString(formData, "category")
  const description = optionalString(formData, "description")
  const template = requireJsonObject(formData, "template")

  await db.insert(workflowTemplates).values({
    accountId,
    name,
    category,
    description,
    template,
    builtIn: false,
  })

  revalidateOpsPaths("/workflow-templates")
}

export async function deleteWorkflowTemplateAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")

  await db
    .update(workflowTemplates)
    .set({ deletedAt: new Date() })
    .where(and(eq(workflowTemplates.id, id), eq(workflowTemplates.builtIn, false)))

  revalidateOpsPaths("/workflow-templates")
}

export async function applyWorkflowTemplateAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")

  const [template] = await db
    .select()
    .from(workflowTemplates)
    .where(and(eq(workflowTemplates.id, id), isNull(workflowTemplates.deletedAt)))
    .limit(1)

  if (!template) throw new Error("Workflow template not found")
  if (!template.accountId) throw new Error("Custom workflow template must be account-scoped")

  const values = objectRecord(template.template)
  if (template.category === "schedule") {
    await db.insert(scheduledOperations).values({
      accountId: template.accountId,
      name: stringValue(values.name) ?? template.name,
      kind: scheduleKindValue(values.kind),
      status: scheduleStatusValue(values.status),
      cron: stringValue(values.cron) ?? "0 2 * * *",
      timezone: stringValue(values.timezone) ?? "UTC",
      payload: objectRecord(values.payload),
    })
  } else if (template.category === "preview") {
    await db.insert(previewLinks).values({
      accountId: template.accountId,
      resourceType: requireTemplateString(values, "resourceType"),
      resourceId: requireTemplateString(values, "resourceId"),
      slug: stringValue(values.slug) ?? `admin-${Date.now()}`,
      targetUrl: requireTemplateString(values, "targetUrl"),
      metadata: objectRecord(values.metadata),
      expiresAt: stringValue(values.expiresAt) ? new Date(stringValue(values.expiresAt)!) : null,
    })
  } else {
    throw new Error(`Unsupported apply category: ${template.category}`)
  }

  revalidateOpsPaths("/workflow-templates", "/schedules")
}

export async function createCustomCommandScheduleAction(formData: FormData) {
  await requireAdmin()
  const accountId = requireString(formData, "accountId")
  const name = requireString(formData, "name")
  const cron = requireString(formData, "cron")
  const timezone = optionalString(formData, "timezone") ?? "UTC"
  const payload = requireJsonObject(formData, "payload")

  await db.insert(scheduledOperations).values({
    accountId,
    name,
    kind: "custom_command",
    status: "active",
    cron,
    timezone,
    payload,
  })

  revalidateOpsPaths("/schedules")
}

export async function runCustomCommandScheduleAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")
  const now = new Date()

  const [schedule] = await db
    .select()
    .from(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.id, id),
        eq(scheduledOperations.kind, "custom_command"),
        isNull(scheduledOperations.deletedAt),
      ),
    )
    .limit(1)

  if (!schedule) throw new Error("Custom command schedule not found")

  await db
    .update(scheduledOperations)
    .set({ lastRunAt: now, updatedAt: now })
    .where(eq(scheduledOperations.id, id))

  await db.insert(eventOutbox).values({
    eventName: "scheduled_operation.run_requested",
    payload: {
      accountId: schedule.accountId,
      scheduleId: schedule.id,
      kind: schedule.kind,
      payload: objectRecord(schedule.payload),
      requestedAt: now.toISOString(),
      requestedBy: "admin",
    },
    status: "PENDING",
    processAt: now,
  })

  revalidateOpsPaths("/schedules", "/outbox")
}

export async function deleteCustomCommandScheduleAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")

  await db
    .update(scheduledOperations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(scheduledOperations.id, id), eq(scheduledOperations.kind, "custom_command")))

  revalidateOpsPaths("/schedules")
}

export async function retryOutboxEventAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")
  const now = new Date()

  const [event] = await db
    .select()
    .from(eventOutbox)
    .where(eq(eventOutbox.id, id))
    .limit(1)

  if (!event) throw new Error("Outbox event not found")
  if (
    event.status !== "FAILED" &&
    !isStaleProcessing(event.status, event.updatedAt, staleOutboxCutoff(now))
  ) {
    throw new Error("Only failed or stale processing events can be retried")
  }

  const [updated] = await db
    .update(eventOutbox)
    .set({
      status: "PENDING",
      processAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(eventOutbox.id, id),
        or(
          eq(eventOutbox.status, "FAILED"),
          and(
            eq(eventOutbox.status, "PROCESSING"),
            lt(eventOutbox.updatedAt, staleOutboxCutoff(now)),
          ),
        ),
      ),
    )
    .returning({ id: eventOutbox.id })

  if (!updated) {
    throw new Error("Only failed or stale processing events can be retried")
  }

  revalidateOpsPaths("/outbox")
}

export async function archiveOutboxEventAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")
  const now = new Date()

  const [event] = await db
    .select()
    .from(eventOutbox)
    .where(eq(eventOutbox.id, id))
    .limit(1)

  if (!event) throw new Error("Outbox event not found")
  if (
    event.status === "PROCESSING" &&
    !isStaleProcessing(event.status, event.updatedAt, staleOutboxCutoff(now))
  ) {
    throw new Error("Active processing events cannot be archived")
  }

  const [updated] = await db
    .update(eventOutbox)
    .set({ status: "ARCHIVED", updatedAt: now })
    .where(
      and(
        eq(eventOutbox.id, id),
        or(
          ne(eventOutbox.status, "PROCESSING"),
          lt(eventOutbox.updatedAt, staleOutboxCutoff(now)),
        ),
      ),
    )
    .returning({ id: eventOutbox.id })

  if (!updated) {
    throw new Error("Active processing events cannot be archived")
  }

  revalidateOpsPaths("/outbox")
}

export async function retryProcessingJobAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")
  const now = new Date()

  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, id))
    .limit(1)

  if (!job) throw new Error("Processing job not found")
  if (job.status !== "FAILED" && job.status !== "CANCELED") {
    throw new Error("Only failed or canceled jobs can be retried")
  }

  const input = parseSourceProcessingJobInput(job.input)
  const retrySource = buildRetrySourceResource(input)
  const payload = parseEventPayload("tileset.build.requested", {
    accountId: job.accountId,
    tilesetId: input.tilesetId,
    jobId: job.id,
    sourceResourceType: retrySource.sourceResourceType,
    sourceResourceId: retrySource.sourceResourceId,
    options: input.options,
  })

  const transitioned = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(processingJobs)
      .set({
        status: "PENDING",
        progress: 0,
        output: null,
        errorCode: null,
        errorMessage: null,
        retryCount: sql<number>`${processingJobs.retryCount} + 1`,
        cancelRequestedAt: null,
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(processingJobs.id, job.id),
          inArray(processingJobs.status, ["FAILED", "CANCELED"]),
        ),
      )
      .returning({ id: processingJobs.id })

    if (!updated) return false

    await tx.insert(processingJobLogs).values({
      jobId: job.id,
      level: "info",
      message: "Admin retry requested",
      metadata: { previousStatus: job.status },
    })

    await tx.insert(eventOutbox).values({
      eventName: "tileset.build.requested",
      payload,
      status: "PENDING",
      processAt: now,
    })

    await tx
      .update(tilesets)
      .set({ status: "BUILDING", buildJobId: job.id })
      .where(eq(tilesets.id, input.tilesetId))

    if (input.uploadId) {
      await tx
        .update(uploads)
        .set({ status: "VALIDATING", linkedTilesetId: input.tilesetId })
        .where(eq(uploads.id, input.uploadId))
    }

    return true
  })

  if (!transitioned) {
    throw new Error("Only failed or canceled jobs can be retried")
  }

  revalidateOpsPaths("/jobs", `/jobs/${id}`)
}

export async function cancelProcessingJobAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")
  const now = new Date()

  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, id))
    .limit(1)

  if (!job) throw new Error("Processing job not found")
  if (job.status === "SUCCEEDED" || job.status === "FAILED" || job.status === "CANCELED") {
    throw new Error("Completed jobs cannot be canceled")
  }

  const transitioned = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(processingJobs)
      .set({
        status: sql<
          typeof processingJobs.status
        >`case when ${processingJobs.status} = 'PENDING' then 'CANCELED' else ${processingJobs.status} end`,
        cancelRequestedAt: now,
        completedAt: sql<
          Date | null
        >`case when ${processingJobs.status} = 'PENDING' then ${now} else ${processingJobs.completedAt} end`,
        updatedAt: now,
      })
      .where(
        and(
          eq(processingJobs.id, id),
          inArray(processingJobs.status, ["PENDING", "PROCESSING"]),
        ),
      )
      .returning({ status: processingJobs.status })

    if (!updated) return null

    const previousStatus =
      updated.status === "CANCELED" ? "PENDING" : updated.status

    await tx.insert(processingJobLogs).values({
      jobId: id,
      level: "warn",
      message:
        previousStatus === "PENDING"
          ? "Admin canceled pending job"
          : "Admin cancellation requested",
      metadata: { previousStatus },
    })

    return updated
  })

  if (!transitioned) {
    throw new Error("Completed jobs cannot be canceled")
  }

  revalidateOpsPaths("/jobs", `/jobs/${id}`)
}

export async function softDeleteArtifactAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")
  const now = new Date()

  await db
    .update(storageObjects)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(storageObjects.id, id), isNull(storageObjects.deletedAt)))

  revalidateOpsPaths("/artifacts")
}

export async function restoreArtifactAction(formData: FormData) {
  await requireAdmin()
  const id = requireString(formData, "id")
  const now = new Date()

  await db
    .update(storageObjects)
    .set({ deletedAt: null, updatedAt: now })
    .where(eq(storageObjects.id, id))

  revalidateOpsPaths("/artifacts")
}
