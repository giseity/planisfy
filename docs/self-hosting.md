# Self Hosting

## Goal

Planisfy's main self-host story should be boring:

```bash
docker compose -f infra/docker/docker-compose.yml up
```

The stack should produce a useful product without cloud credentials, billing, email, routing data, or geocoding.

## Current Services

- API
- console
- admin
- docs
- marketing
- worker-geodata
- PostgreSQL
- Redis
- Martin
- Valhalla
- local artifact storage volume

## Target Additions

- PostGIS-enabled database image.
- optional MinIO profile.
- setup/seed script.
- Docker smoke test.

## Acceptance

- Console shows a real map.
- Demo style, source metadata, and sample tiles agree.
- Health reports API, database, Redis, Martin, Valhalla, and worker-geodata heartbeat state.
- New developers can complete setup from the README and docs.
