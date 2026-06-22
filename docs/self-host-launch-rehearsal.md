# Self-Host Launch Rehearsal

Run this on a clean machine before tagging a self-host release.

## Clean-Machine Boot

1. Clone the release branch or tag.
2. Copy `.env.example` to `.env` and generate real local secrets.
3. Run `scripts/self-host-setup.sh`.
4. Start the base stack:

   ```bash
   docker compose --env-file .env -f infra/docker/docker-compose.yml up -d postgres redis martin api console worker-geodata
   pnpm db:migrate
   ```

5. Verify:

   ```bash
   curl -fsS http://localhost:4000/health
   curl -fsS http://localhost:4000/setup/preflight
   ```

## Missing Dataset Recovery

Planisfy should boot without bundled map datasets. Missing datasets should show degraded checks, not crash the stack.

To rehearse recovery:

1. Move runtime datasets out of the way:

   ```bash
   mv infra/docker/data/pmtiles infra/docker/data/pmtiles.missing 2>/dev/null || true
   mv infra/docker/data/valhalla_data infra/docker/data/valhalla_data.missing 2>/dev/null || true
   mv infra/docker/data/elevation infra/docker/data/elevation.missing 2>/dev/null || true
   ```

2. Restart the stack and confirm `/health/detailed` and `/setup/preflight` report degraded dataset checks.
3. Restore the directories and restart affected services.
4. Re-run the same checks and confirm the degraded messages clear.

## Backup, Restore, And Upgrade

Run the backup/restore smoke:

```bash
pnpm smoke:self-host-backup-restore
```

For the local MinIO/S3 path, run the same smoke with the MinIO env file:

```bash
ENV_FILE=/path/to/minio.env pnpm smoke:self-host-backup-restore
```

For a full local self-host QA pass, also run:

```bash
SMOKE_BROWSER_PRODUCT_LOOP=true pnpm smoke:self-host-compose
pnpm e2e:product-loop:full
```

The smoke scripts preserve evidence under `dogfood-output/`, including browser
screenshots and generated upload fixtures.

If the supervisor profile is enabled, run the upgrade smoke:

```bash
SUPERVISOR_URL=http://127.0.0.1:4010 \
SUPERVISOR_TOKEN=... \
PLANISFY_RELEASE_MANIFEST=docs/examples/release-manifest.example.json \
pnpm smoke:self-host-upgrade
```

Add `--confirm-backup`, `--confirm-apply`, and `--confirm-rollback` only on a disposable rehearsal stack or during an approved maintenance window.

## Evidence To Keep

- Release SHA/tag.
- Docker and Compose versions.
- `/health/detailed` output before and after dataset recovery.
- `/setup/preflight` output.
- Backup/restore smoke output.
- Upgrade smoke output, if supervisor is enabled.
- Public style URL and TileJSON URL from the product-loop smoke.
- `dogfood-output/` screenshots and generated fixtures for the run.
