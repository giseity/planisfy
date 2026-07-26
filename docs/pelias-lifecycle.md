# Pelias Build and Release Lifecycle

Managed Planisfy treats a Pelias planet import as an immutable build artifact.
The build may run on a temporary high-capacity host; the serving VPS only
restores a verified Elasticsearch snapshot and switches the `pelias_live`
alias.

## Build Contract

Record these values before importing:

- source PBF URL, publication date, byte size, and SHA-256;
- exact `pelias/docker` commit;
- enabled importers and their source versions;
- Pelias index name;
- Elasticsearch and Pelias image versions.

The managed planet-address profile contains OpenStreetMap, Who's On First,
OpenAddresses, and Geonames. Interpolation, transit, and polylines are not part
of the first managed release.

## Create the Snapshot

Configure Elasticsearch with a filesystem snapshot repository mounted outside
its data volume. The official Pelias Docker project can use the committed
override:

```bash
docker compose \
  -f docker-compose.yml \
  -f /path/to/planisfy/infra/docker/pelias-snapshot.override.yml \
  up -d elasticsearch
```

Then register and create a snapshot:

```bash
curl -fsS -X PUT "$ELASTICSEARCH_URL/_snapshot/planisfy" \
  -H 'content-type: application/json' \
  -d '{"type":"fs","settings":{"location":"/snapshots/repository","compress":true}}'

curl -fsS -X PUT \
  "$ELASTICSEARCH_URL/_snapshot/planisfy/$SNAPSHOT_NAME?wait_for_completion=true" \
  -H 'content-type: application/json' \
  -d '{"indices":"pelias","include_global_state":false}'
```

Confirm that the snapshot state is `SUCCESS`, then package the repository
contents at the archive root:

```bash
PELIAS_SNAPSHOT_NAME=pelias-planet-address-YYYY-MM-DD \
  scripts/create-pelias-snapshot.sh

scripts/package-pelias-snapshot.sh \
  /path/to/snapshots/repository \
  /path/to/artifacts/pelias-planet-address.tar
```

The archive must contain `index.latest` or `index-N` at its root. Keep the
generated `.sha256` file beside it. A plain `.tar` avoids wasting CPU trying to
recompress Lucene segments; `.tar.gz` and `.tgz` are also supported.

For the dedicated build host, `scripts/finalize-pelias-build.sh` performs the
repository restart, snapshot verification, archive packaging, checksum, and
manifest generation after the build log contains `BUILD_COMPLETED`. It records
the actual Docker image IDs/digests in the manifest even when the upstream
Pelias project uses moving image labels.

## Register a Release

The operator workflow is:

1. Create `POST /api/v1/console/operations/geocoding-builds` with source
   provenance and the target activation worker.
2. Upload the archive to the configured artifact bucket.
3. Register it through
   `POST /api/v1/console/operations/geocoding-builds/:id/artifacts`, including
   its exact size, SHA-256, snapshot name, object location, and manifest.
4. Create a versioned release through
   `POST /api/v1/console/operations/geocoding-builds/:id/releases`.
5. Stop before activation when preparing a deployment packet.

Artifact registration verifies that the object exists in the configured
provider and that its size matches. The root agent verifies the SHA-256 again
after download and before extraction.

## Activation and Rollback

Activation is explicit. The runtime root agent restores the snapshot into a
versioned index, waits for at least yellow health, atomically moves the
`pelias_live` alias, and probes the Pelias API. The previous index is retained.

Rollback does not require another import:

1. identify the previous index from the release activation metadata;
2. atomically move `pelias_live` back with Elasticsearch `/_aliases`;
3. verify a Pelias search and reverse-geocoding request;
4. mark the failed release deprecated and record the incident.

Do not delete a previous index until the new release has passed production
smoke tests and the rollback retention window.
