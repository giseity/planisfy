# Planisfy Upgrade Manifest

Shared self-host upgrade release manifest parser and policy helpers.

## Owns

- Release manifest schema validation.
- Required environment checks.
- Pinned image digest and rollback eligibility helpers.

## Does Not Own

- Supervisor command execution.
- API setup/preflight route rendering.
- Release fetching, storage, or deployment orchestration.

## Important Commands

```bash
pnpm -F @planisfy/upgrade-manifest check-types
pnpm -F @planisfy/upgrade-manifest test
pnpm -F @planisfy/upgrade-manifest lint
```
