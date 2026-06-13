# Planisfy Official Pelias Metro

This project is a production-like Pelias metro build for validating real Pelias
behavior without attempting a planet import. It follows the official
`pelias/docker` project layout and uses the official Portland metro starter data
because Pelias recommends that project for first-time small builds.

The default Planisfy Compose Pelias fixture is intentionally tiny and
deterministic. Use that fixture for fast smoke tests. Use this metro project
when you need realistic parsing, admin lookup, placeholder, libpostal, import
ordering, source priority, and ranking behavior.

## 12GB WSL Profile

This can run in a 12GB WSL setup, but the import phase is tight. Recommended
local posture:

- keep `PELIAS_ES_HEAP=2g`;
- keep `OPENADDRESSES_PARALLELISM=1`;
- keep `ENABLE_GEONAMES=false` at first;
- import Pelias before starting every other Planisfy service;
- skip interpolation during the first build, then add it if address-range
  interpolation is important for the test.

Provision at least 30-80GB of free Docker/WSL disk space for data, images, and
the Elasticsearch index.

## First Run

```bash
scripts/pelias-metro.sh bootstrap
scripts/pelias-metro.sh pull
scripts/pelias-metro.sh build-core
scripts/pelias-metro.sh up
curl "http://localhost:34100/v1/search?text=Powell%27s%20Books"
```

`build-core` downloads and imports Who's On First, OpenAddresses,
OpenStreetMap, polylines, transit, and CSV inputs. It also builds Placeholder.
It deliberately skips Geonames and interpolation for the default laptop profile.

To include interpolation later:

```bash
scripts/pelias-metro.sh build-interpolation
scripts/pelias-metro.sh restart
```

## Point Planisfy At This Stack

When the Planisfy API runs on the host:

```bash
PELIAS_URL=http://localhost:34100
```

When the Planisfy API runs in the Planisfy Compose network while this metro
stack runs as a separate Compose project:

```bash
CONTAINER_PELIAS_URL=http://host.docker.internal:34100
```

On Linux/WSL, Docker Desktop usually provides `host.docker.internal`. If it does
not resolve, use the WSL host gateway IP or run both projects on an explicitly
shared Docker network.
