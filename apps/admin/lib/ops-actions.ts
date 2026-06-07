"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull, sql } from "drizzle-orm"
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
import { requireAdmin } from "@/lib/admin-auth"
import { isStaleProcessing, staleOutboxCutoff } from "@/lib/ops"

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

  await db
    .update(eventOutbox)
    .set({
      status: "PENDING",
      processAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(eventOutbox.id, id))

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

  await db
    .update(eventOutbox)
    .set({ status: "ARCHIVED", updatedAt: now })
    .where(eq(eventOutbox.id, id))

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

  await db.transaction(async (tx) => {
    await tx
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
      .where(eq(processingJobs.id, job.id))

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
      .set({ status: "BUILDING" })
      .where(eq(tilesets.id, input.tilesetId))

    if (input.uploadId) {
      await tx
        .update(uploads)
        .set({ status: "VALIDATING", linkedTilesetId: input.tilesetId })
        .where(eq(uploads.id, input.uploadId))
    }
  })

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

  await db.transaction(async (tx) => {
    await tx
      .update(processingJobs)
      .set({
        status: job.status === "PENDING" ? "CANCELED" : job.status,
        cancelRequestedAt: now,
        completedAt: job.status === "PENDING" ? now : job.completedAt,
        updatedAt: now,
      })
      .where(eq(processingJobs.id, id))

    await tx.insert(processingJobLogs).values({
      jobId: id,
      level: "warn",
      message:
        job.status === "PENDING"
          ? "Admin canceled pending job"
          : "Admin cancellation requested",
      metadata: { previousStatus: job.status },
    })
  })

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
