import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, eventOutbox } from "@planisfy/database";
import {
  parseEventPayload,
  type EventName,
  type EventPayload,
} from "@planisfy/events";

type DatabaseClient = typeof db;

export async function enqueueOutboxEvent<N extends EventName>(
  params: {
    eventName: N;
    payload: EventPayload<N>;
    processAt?: Date;
  },
  database: DatabaseClient = db
) {
  const payload = parseEventPayload(params.eventName, params.payload);
  const [event] = await database
    .insert(eventOutbox)
    .values({
      eventName: params.eventName,
      payload,
      processAt: params.processAt ?? new Date(),
    })
    .returning();

  return event!;
}

export async function claimDueOutboxEvents(params: { limit?: number } = {}) {
  const due = await db
    .select({ id: eventOutbox.id })
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.status, "PENDING"),
        lte(eventOutbox.processAt, new Date())
      )
    )
    .orderBy(asc(eventOutbox.processAt), asc(eventOutbox.createdAt))
    .limit(params.limit ?? 25);

  if (due.length === 0) {
    return [];
  }

  return db
    .update(eventOutbox)
    .set({
      status: "PROCESSING",
      attempts: sql<number>`${eventOutbox.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      inArray(
        eventOutbox.id,
        due.map((event) => event.id)
      )
    )
    .returning();
}

export async function completeOutboxEvent(id: string) {
  await db
    .update(eventOutbox)
    .set({ status: "COMPLETED", updatedAt: new Date() })
    .where(eq(eventOutbox.id, id));
}

export async function failOutboxEvent(
  id: string,
  error: unknown,
  params: { retryDelayMs?: number; archive?: boolean } = {}
) {
  const retryDelayMs = params.retryDelayMs ?? 60_000;
  await db
    .update(eventOutbox)
    .set({
      status: params.archive ? "FAILED" : "PENDING",
      lastError: error instanceof Error ? error.message : String(error),
      processAt: new Date(Date.now() + retryDelayMs),
      updatedAt: new Date(),
    })
    .where(eq(eventOutbox.id, id));
}
