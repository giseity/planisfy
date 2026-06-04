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

## Recovery

Operators need documented paths for:

- failed jobs
- retrying jobs
- storage reconciliation
- backup
- restore
- upgrades
- basemap release verification

## Admin Surface

Admin should eventually inspect jobs, job logs, storage objects, usage rollups, audit events, tenants/accounts, and service health.
