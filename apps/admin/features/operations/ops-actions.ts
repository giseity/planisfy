"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm"
import {
  db,
  eventOutbox,
  processingJobLogs,
  processingJobs,
  storageObjects,
  tilesets,
  uploads,
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

function revalidateOpsPaths(...paths: string[]) {
  revalidatePath("/failures")
  for (const path of paths) revalidatePath(path)
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
