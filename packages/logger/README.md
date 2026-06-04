# Planisfy Logger

Shared structured logging factory.

## Owns

- Structured logger creation.
- Service naming convention.
- Service naming convention shared by apps and workers.

## Rules

- Do not put app-specific request context, auth policy, or business logging in this package.
- Apps can wrap the base logger with child loggers.
- The implementation is intentionally dependency-free until the workspace can install Pino reliably.

## Commands

```bash
pnpm -F @planisfy/logger check-types
pnpm -F @planisfy/logger lint
```
