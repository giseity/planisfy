# Planisfy Runtime Supervisor

Host-local control plane for serving runtimes. It exposes a narrow token-protected API for restarting and health-checking Martin, Valhalla, and elevation services.

Routes:

- `GET /health` is public liveness.
- `GET /services` requires `RUNTIME_SUPERVISOR_TOKEN`.
- `POST /services/:service/restart` requires `RUNTIME_SUPERVISOR_TOKEN`.
- `POST /services/:service/health` requires `RUNTIME_SUPERVISOR_TOKEN`.

Supported drivers:

- `compose`: restarts allowlisted Docker Compose services.
- `docker`: restarts running containers with allowlisted Compose service labels.
- `systemd`: restarts allowlisted systemd units.

This service should run only on the machine that serves runtime artifacts.
