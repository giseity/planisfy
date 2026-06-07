# Operations

## Self-Host Target

`docker compose up` should start a useful product stack with a visible map, bootstrap account flow or seed account, and demo data.

## Health

Health should cover:

- API
- database
- Redis
- Martin
- Valhalla
- worker-geodata
- storage provider

The API detailed health endpoint reports `workerGeodata` from a Redis heartbeat written by the worker.

## Local Worker

`apps/worker-geodata` should run beside the API anywhere uploads or tileset processing are enabled.

```bash
pnpm -F worker-geodata dev
pnpm -F worker-geodata check-types
```

## Recovery

Operators need documented paths for:

- failed jobs
- retrying jobs
- storage reconciliation
- backup
- restore
- upgrades
- basemap release verification
- support bundle export

## Backup

Use the self-host backup script from the repository root:

```bash
scripts/self-host-backup.sh
```

The script creates `backups/planisfy-<timestamp>/` by default and includes:

- `postgres.dump`: custom-format PostgreSQL dump.
- `redis.dump.rdb`: Redis snapshot when Redis is reachable.
- `storage.tgz`: local object storage, including uploaded artifacts and Martin
  source aliases.
- `pmtiles.tgz`: local PMTiles mount.
- `valhalla_data.tgz`: local Valhalla graph/runtime data mount.
- `manifest.json`: backup timestamp, git SHA, and included sections.

Use `--output DIR` to write a specific backup directory.

## Restore

Restore is intentionally guarded because it overwrites database and local data
directories:

```bash
scripts/self-host-restore.sh --backup backups/planisfy-YYYYMMDDTHHMMSSZ --confirm
```

The restore script starts Postgres and Redis, restores `postgres.dump`, restores
`redis.dump.rdb` when present, and replaces local `storage`, `pmtiles`, and
`valhalla_data` directories when their archives are present. Restart the full
stack after restore.

## Support Bundle

Use the support bundle script when diagnosing a failed setup, upgrade, or
runtime incident:

```bash
scripts/self-host-support-bundle.sh
```

The script creates `support-bundles/planisfy-support-<timestamp>/` by default
and captures:

- `manifest.json` with timestamp, git SHA, and branch.
- `env.redacted.txt` with only environment key presence and secrets redacted.
- `compose.config.txt`, `compose.ps.txt`, and recent Compose logs.
- API `/health`, `/health/detailed`, and `/metrics` responses when reachable.

Attach the bundle to issue reports or keep it with incident notes before making
changes.

## Upgrade

Recommended manual self-host upgrade flow:

1. Run `scripts/self-host-backup.sh`.
2. Set `PLANISFY_RELEASE_MANIFEST` and check `/setup/preflight`.
3. Pull or checkout the target Planisfy release.
4. Review `.env.example` for new required variables.
5. Rebuild or pull containers.
6. Run `pnpm -F @planisfy/database db:migrate`.
7. Start the stack and check `/health/detailed`.
8. Verify at least one published style URL and one TileJSON URL.

For guarded self-host upgrades, enable the `with-supervisor` Compose profile
and use Admin -> Upgrade. The Admin server calls the supervisor with
`SUPERVISOR_URL` and `SUPERVISOR_TOKEN`; the browser never receives the token.
The supervisor stores operation records under its local state directory and
requires:

- a valid pinned release manifest;
- a successful backup operation before apply;
- no `:latest` release image targets;
- `rollbackSupported: true` before rollback.

Rollback calls `scripts/self-host-restore.sh --confirm`, restarts services, and
checks `/health/detailed`.

## Admin Surface

Admin currently inspects jobs, job logs, storage objects, usage rollups, audit
events, tenants/accounts, service health, and the local Upgrade Center when the
supervisor is configured.

Console currently exposes Platform readiness and Operations workflows. Platform
distinguishes configured, degraded, and unavailable capabilities for storage,
Martin, Valhalla, geocoding, static maps, Overture, email, billing, worker
toolchain, and credential encryption. Operations includes guided selectors for
common schedule, backup, delivery, execution target, and worker profile inputs
while keeping advanced JSON fields where the backend accepts arbitrary payloads.
