# Operations

## Health And Metrics

The API exposes:

- `GET /health`: basic liveness.
- `GET /health/detailed`: Postgres, Redis, worker heartbeat, storage, Martin, tile-worker mode, and Valhalla readiness.
- `GET /metrics`: Prometheus text metrics for the API process.
- `GET /setup/preflight`: deployment-mode capability and product-loop checks.

In production, `/health/detailed`, `/metrics`, and the root `/setup/preflight` route require internal authorization. Console uses the authenticated `/console/setup/preflight` mount for operator-facing checks.

## Worker Operations

`apps/worker-geodata` writes a Redis heartbeat used by detailed health. It claims outbox events, dispatches BullMQ jobs, updates processing jobs, and stores logs. Run locally with:

```bash
pnpm --filter worker-geodata dev
```

Root agents are polling workers for large build and runtime deployment jobs.
Build workers create artifacts. Serving workers activate artifacts into Valhalla
or Martin runtimes. A successful build does not imply that the runtime is
serving the artifact.

## Backup And Restore

```bash
pnpm self-host:backup
pnpm self-host:restore --backup backups/planisfy-YYYYMMDDTHHMMSSZ --confirm
```

Backups include Postgres, Redis snapshot when reachable, local storage, MinIO data when using the `with-minio` profile, PMTiles, Valhalla data, and a manifest. Restore is guarded because it overwrites local data.

## Support Bundles

```bash
pnpm self-host:support-bundle
```

The bundle captures redacted environment presence, Compose config/status/logs, and reachable API health/metrics responses.

## Supervisor

The optional `with-supervisor` profile starts `apps/self-host-supervisor` on `127.0.0.1:4010`. Routes other than `/health` require `SUPERVISOR_TOKEN`. Admin calls it server-side for preflight, backup, apply, rollback, and operation status.
