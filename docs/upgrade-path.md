# Upgrade Path

Planisfy self-host upgrades use pinned release manifests. The first goal is to
make upgrades inspectable and repeatable before the supervisor applies changes.

## Release Manifest

Set `PLANISFY_RELEASE_MANIFEST` to a JSON manifest for the target release. A
valid manifest includes:

- `version` and `createdAt`
- pinned service images as `{ service, image, digest }`
- optional `minimumVersion`
- database and storage migration notes
- worker compatibility notes
- required environment variables
- `backupRequired`
- `rollbackSupported`

See `docs/examples/release-manifest.valid.json`.

## Preflight

Before upgrading, check:

```bash
curl http://localhost:4000/setup/preflight
curl http://localhost:4000/health/detailed
```

The `Upgrade readiness` group reports the current version, target release
manifest status, required target environment variables, backup script
availability, migration metadata availability, storage access, Martin URL,
worker heartbeat guidance, and free disk when the runtime can report it.

## Backup

Run a backup before changing images or migrations:

```bash
scripts/self-host-backup.sh
```

The backup includes PostgreSQL, Redis when reachable, local storage, PMTiles,
Valhalla data, and a manifest. Redis job state is useful for recovery, but
PostgreSQL and storage artifacts are the durable sources of truth.

## Apply

The local-only self-host supervisor is responsible for the automated apply flow:

1. validate the target release manifest;
2. require a successful backup;
3. pull pinned image digests;
4. run database and storage migrations;
5. restart services in dependency order;
6. verify `/health/detailed` after services restart.

The current supervisor endpoints are:

- `GET /health`
- `GET /version`
- `POST /preflight`
- `POST /backup`
- `POST /upgrade/apply`
- `POST /upgrade/rollback`
- `GET /operations`
- `GET /operations/:id`

`POST /upgrade/apply` requires `manifestPath` and `backupOperationId`. It
refuses missing backups, invalid manifests, unpinned digests, and `:latest`
image targets. Operation records are written under the supervisor state
directory.

Do not upgrade from floating `latest` images in production.

## Rollback

Rollback is allowed only when the target manifest sets
`rollbackSupported: true` and a backup exists. The supervisor restores the
selected backup with `scripts/self-host-restore.sh --confirm`, restarts
services, then reruns `/health/detailed`.

If a release includes irreversible migrations, set `rollbackSupported: false`
and document the forward recovery path in the manifest notes.
