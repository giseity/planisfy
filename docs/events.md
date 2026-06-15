# Events

Async event payload schemas live in `@planisfy/events`. Geodata queue names, heartbeat keys, and job input contracts live in `@planisfy/geodata-contracts`.

## Current Flow

1. API mutations create durable database rows and `event_outbox` entries.
2. `apps/worker-geodata` claims relevant outbox events.
3. Claimed work is dispatched to BullMQ and processed.
4. Worker updates processing jobs, logs, storage ledger rows, and heartbeat state.

Events should be parsed through the shared package before handling. Contract packages should stay free of database, Redis, filesystem, and HTTP dependencies.
