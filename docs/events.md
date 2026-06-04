# Events

## Current

Source uploads now write typed `event_outbox` rows for `upload.created` and cleanup requests. BullMQ still exists as the current transport until `apps/worker-geodata` owns event claiming and processing.

## Target

Planisfy uses a durable outbox:

1. API writes primary state in a database transaction.
2. API writes an `event_outbox` row alongside that state.
3. A worker claims due events.
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
