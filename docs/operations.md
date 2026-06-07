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

Recommended self-host upgrade flow:

1. Run `scripts/self-host-backup.sh`.
2. Pull or checkout the target Planisfy release.
3. Review `.env.example` for new required variables.
4. Rebuild or pull containers.
5. Run `pnpm -F @planisfy/database db:migrate`.
6. Start the stack and check `/health/detailed`.
7. Verify at least one published style URL and one TileJSON URL.

## Admin Surface

Admin should eventually inspect jobs, job logs, storage objects, usage rollups, audit events, tenants/accounts, and service health.
