# Security

## Current Concerns

- Internal API routes must require `X-Internal-Secret` in production-like deployments.
- Upload validation is early.
- Remote imports are not yet a durable product feature.
- Billing and storage provider configuration are alpha.

## Target Requirements

- Validate all upload size, type, filename, and content assumptions.
- Prevent storage path traversal through centralized path builders.
- Treat remote imports as SSRF-sensitive.
- Separate public map routes from console/admin/internal routes.
- Define API key scopes for styles, tiles, uploads, datasets, tilesets, usage, and admin operations.
- Keep tenant isolation assumptions explicit for both self-host and hosted cloud.

## Rule

Production-like environments must not silently run with development internal secrets.
