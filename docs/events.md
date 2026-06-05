# Events

## Current

Tileset uploads write durable upload, storage, tileset, processing job, and `tileset.build.requested` outbox records. `apps/worker-geodata` claims due build-request events and dispatches BullMQ geodata work, so BullMQ remains the execution transport while `event_outbox` is the durable trigger source.

Publishing a tileset version writes `tileset.version.published`. That event is currently a durable integration hook for future notification/indexing workers; it is not claimed by the geodata worker.

Legacy source uploads still enqueue BullMQ directly while the source workflow is folded into the same event contract.

## Target

Planisfy uses a durable outbox:

1. API writes primary state in a database transaction.
2. API writes an `event_outbox` row alongside that state.
3. A worker claims due events for the event names it owns.
4. The worker validates the payload through `@planisfy/events`.
5. The worker processes or schedules transport work.
6. Completion, retry, and failure state are durable.

## Initial Event Names

- `upload.created`
- `upload.validated`
- `dataset.normalized`
- `tileset.build.requested`
- `tileset.build.completed`
- `tileset.build.failed`
- `tileset.version.published`
- `style.publish.requested`
- `basemap.release.requested`
- `basemap.release.completed`
- `usage.rollup.requested`
- `artifact.cleanup.requested`

## Rules

- Unknown event names should fail closed.
- Event schemas and event docs must stay in lockstep.
- Redis and BullMQ are transport details, not the source of truth.
