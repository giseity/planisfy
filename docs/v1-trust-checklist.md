# V1 Trust Checklist

Use this checklist before calling a deployment ready for real users.

- `DEPLOYMENT_MODE` is set intentionally.
- `BETTER_AUTH_SECRET`, `INTERNAL_API_SECRET`, and credential encryption are production-grade.
- Database migrations have run.
- Storage provider is configured and visible in `/health/detailed`.
- Worker heartbeat is fresh.
- Martin has required tile/font data or uploaded tilesets are available from storage.
- Valhalla has graph data for the deployment region.
- Pelias is configured when geocoding is advertised.
- Elevation DEM data exists when elevation is advertised.
- Static renderer is configured when static maps are advertised.
- Published style and TileJSON URLs have been smoke-tested.
- Backup and restore have been tested.
- Support bundle generation works.
- Managed live smoke has passed for provider configuration, object storage, billing and email adapter availability, public HTTPS ingress/CORS, internal managed smoke, and the browser product loop.
- Public docs do not list unimplemented endpoints.
