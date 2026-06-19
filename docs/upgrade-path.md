# Upgrade Path

## Manual Self-Host Upgrade

1. Run `scripts/self-host-backup.sh`.
2. Review release notes and `.env.example` changes.
3. Pull or checkout the target version.
4. Rebuild or pull containers.
5. Run `pnpm db:migrate`.
6. Start the stack.
7. Check `/health/detailed`, `/setup/preflight`, one published style URL, and one TileJSON URL.

## Supervisor Upgrade

The optional supervisor accepts pinned release manifests validated by `@planisfy/upgrade-manifest`. It requires token auth, refuses floating `:latest` image targets, requires a successful backup before apply, and only rolls back when the manifest permits rollback.

## Upgrade Smoke

Use `pnpm smoke:self-host-upgrade` to prove supervisor reachability and preflight against a pinned manifest:

```bash
SUPERVISOR_URL=http://127.0.0.1:4010 \
SUPERVISOR_TOKEN=... \
PLANISFY_RELEASE_MANIFEST=docs/examples/release-manifest.example.json \
pnpm smoke:self-host-upgrade
```

The command is read-only by default except for supervisor preflight records. Add `--confirm-backup`, `--confirm-apply`, and `--confirm-rollback` only on a disposable rehearsal stack or during an approved maintenance window.
