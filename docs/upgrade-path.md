# Upgrade Path

## Manual Self-Host Upgrade

1. Run `scripts/self-host-backup.sh`.
2. Review release notes and `.env.example` changes.
3. Pull or checkout the target version.
4. Rebuild or pull containers.
5. Run `pnpm --filter @planisfy/database db:migrate`.
6. Start the stack.
7. Check `/health/detailed`, `/setup/preflight`, one published style URL, and one TileJSON URL.

## Supervisor Upgrade

The optional supervisor accepts pinned release manifests validated by `@planisfy/upgrade-manifest`. It requires token auth, refuses floating `:latest` image targets, requires a successful backup before apply, and only rolls back when the manifest permits rollback.
