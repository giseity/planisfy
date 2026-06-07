# V1 Trust Checklist

Use this checklist for every v1 release candidate. Each item must link to or
record evidence from a test run, smoke run, manual check, support bundle, or
documentation review.

## Required Gates

| Gate | Evidence |
| ---- | -------- |
| Lint | `pnpm lint` output or CI run URL |
| Typecheck | `pnpm check-types` output or CI run URL |
| Unit and regression tests | `pnpm test` output or CI run URL |
| Build | `pnpm build` output or CI run URL |
| Docker images | CI Docker matrix run URL for API, Console, Admin, Docs, Marketing, worker-geodata, and self-host supervisor |
| Non-binary Compose smoke | `scripts/docker-compose-smoke.sh` output or CI run URL |
| Optional PMTiles smoke | `Demo Data Smoke` workflow URL or explicit `not applicable` note |
| Setup preflight | `/setup/preflight` JSON saved with required blockers reviewed |
| Detailed health | `/health/detailed` JSON saved after stack boot |
| Support bundle | `scripts/self-host-support-bundle.sh` archive path or incident note |

## Product Contracts

| Contract | Evidence |
| -------- | -------- |
| Published style JSON remains immutable after draft edits | API regression test run |
| Style latest alias follows current published version | API regression test run |
| Explicit style version URLs remain immutable | API regression test run |
| Tileset stable URL follows current version | API regression test run |
| Tileset versioned URL remains immutable | API regression test run |
| Martin stable and version aliases are registered | API test or Compose smoke evidence |
| Console source-to-style helpers select uploaded/imported tilesets correctly | Console test run |
| Console publishability messages match workflow state | Console test run |

## Upgrade Readiness

| Gate | Evidence |
| ---- | -------- |
| Release manifest validates | Manifest parser test and `/setup/preflight` `upgrade-release-manifest` check |
| Required release env vars are present | `/setup/preflight` `upgrade-required-env` check |
| Backup script is available | `/setup/preflight` `upgrade-backup-script` check |
| Migration metadata is available or intentionally bundled elsewhere | `/setup/preflight` `upgrade-migration-metadata` check |
| Storage path is reachable | `/setup/preflight` `upgrade-storage-access` check |
| Martin URL is configured | `/setup/preflight` `upgrade-martin-url` check |
| Free disk checked or manually recorded | `/setup/preflight` `upgrade-free-disk` check or manual note |
| Worker heartbeat checked | `/health/detailed` workerGeodata result |
| Supervisor token is configured only server-side | Admin env review; browser devtools check when UI is tested |
| Apply refuses `:latest` or unpinned targets | Supervisor test run |
| Apply refuses missing backup | Supervisor test run |
| Rollback refuses unsupported manifests | Supervisor test run |

## Manual Browser Checks

| Surface | Evidence |
| ------- | -------- |
| Console Platform shows configured/degraded/unavailable capabilities accurately | Screenshot or note |
| Console Operations guided selectors work for schedules, backups, delivery, targets, and worker profiles | Screenshot or note |
| Admin Upgrade Center loads without exposing supervisor token | Screenshot or note |
| Admin Upgrade Center can run preflight and backup when supervisor profile is enabled | Operation ID and log tail |

## Documentation

| Document | Evidence |
| -------- | -------- |
| README self-host quick start matches scripts and Compose | Review note |
| `docs/self-hosting.md` matches current profiles and env vars | Review note |
| `docs/operations.md` matches backup, restore, supervisor, and UI behavior | Review note |
| `docs/storage.md` distinguishes full self-host backups from artifact backups | Review note |
| `docs/testing.md` lists default and opt-in gates | Review note |
| `docs/upgrade-path.md` matches supervisor endpoints and manifest format | Review note |

## Release Notes

Record:

- release version;
- commit SHA;
- manifest path and SHA-256;
- image digests;
- backup operation ID or backup directory;
- irreversible migration notes;
- rollback support decision;
- known degraded optional capabilities.
