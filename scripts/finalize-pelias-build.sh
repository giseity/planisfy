#!/usr/bin/env bash
set -euo pipefail

project_dir=${PELIAS_PROJECT_DIR:-/mnt/build/pelias/project}
tools_dir=${PELIAS_TOOLS_DIR:-/mnt/build/pelias/tools}
data_dir=${PELIAS_DATA_DIR:-/mnt/build/pelias/data}
artifact_dir=${PELIAS_ARTIFACT_DIR:-/mnt/build/pelias/artifacts}
build_log=${PELIAS_BUILD_LOG:-/mnt/build/pelias/logs/planet-build.log}
snapshot_name=${PELIAS_SNAPSHOT_NAME:?PELIAS_SNAPSHOT_NAME is required}
source_url=${PELIAS_SOURCE_URL:?PELIAS_SOURCE_URL is required}
source_date=${PELIAS_SOURCE_DATE:?PELIAS_SOURCE_DATE is required}
source_checksum=${PELIAS_SOURCE_SHA256:?PELIAS_SOURCE_SHA256 is required}
source_size=${PELIAS_SOURCE_SIZE:?PELIAS_SOURCE_SIZE is required}
docker_commit=${PELIAS_DOCKER_COMMIT:?PELIAS_DOCKER_COMMIT is required}
street_source_build_id=${PELIAS_STREET_SOURCE_BUILD_ID:?PELIAS_STREET_SOURCE_BUILD_ID is required}
street_source_checksum=${PELIAS_STREET_SOURCE_SHA256:?PELIAS_STREET_SOURCE_SHA256 is required}
street_export_checksum=${PELIAS_STREET_EXPORT_SHA256:?PELIAS_STREET_EXPORT_SHA256 is required}
street_export_size=${PELIAS_STREET_EXPORT_SIZE:?PELIAS_STREET_EXPORT_SIZE is required}
valhalla_image=${PELIAS_VALHALLA_IMAGE:?PELIAS_VALHALLA_IMAGE is required}

if ! grep -q '^BUILD_COMPLETED$' "$build_log"; then
  echo "Pelias build has not completed successfully" >&2
  exit 1
fi

mkdir -p "$artifact_dir" "$data_dir/snapshots/repository"
artifact_path="$artifact_dir/${snapshot_name}.tar"
manifest_path="$artifact_dir/${snapshot_name}.manifest.json"
compose_user="$(id -u):$(id -g)"

cd "$project_dir"
DOCKER_USER="$compose_user" docker compose \
  -f docker-compose.yml \
  -f "$tools_dir/pelias-snapshot.override.yml" \
  up -d elasticsearch

for _ in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:9200/_cluster/health >/dev/null; then
    break
  fi
  sleep 5
done
curl -fsS http://127.0.0.1:9200/_cluster/health >/dev/null

snapshot_state=$(curl -fsS \
  "http://127.0.0.1:9200/_snapshot/planisfy/$snapshot_name" \
  2>/dev/null | python3 -c \
  'import json,sys; print((json.load(sys.stdin).get("snapshots") or [{}])[0].get("state", ""))' \
  2>/dev/null || true)
if [ "$snapshot_state" != "SUCCESS" ]; then
  ELASTICSEARCH_URL=http://127.0.0.1:9200 \
    PELIAS_SNAPSHOT_REPOSITORY=planisfy \
    PELIAS_SNAPSHOT_NAME="$snapshot_name" \
    PELIAS_INDEX_NAME=pelias \
    "$tools_dir/create-pelias-snapshot.sh"
fi

if [ -f "$artifact_path" ] && [ -f "${artifact_path}.sha256" ]; then
  sha256sum -c "${artifact_path}.sha256"
else
  "$tools_dir/package-pelias-snapshot.sh" \
    "$data_dir/snapshots/repository" \
    "$artifact_path"
fi

PELIAS_ARTIFACT_PATH="$artifact_path" \
PELIAS_MANIFEST_PATH="$manifest_path" \
PELIAS_SNAPSHOT_NAME="$snapshot_name" \
PELIAS_SOURCE_URL="$source_url" \
PELIAS_SOURCE_DATE="$source_date" \
PELIAS_SOURCE_SHA256="$source_checksum" \
PELIAS_SOURCE_SIZE="$source_size" \
PELIAS_DOCKER_COMMIT="$docker_commit" \
PELIAS_STREET_SOURCE_BUILD_ID="$street_source_build_id" \
PELIAS_STREET_SOURCE_SHA256="$street_source_checksum" \
PELIAS_STREET_EXPORT_SHA256="$street_export_checksum" \
PELIAS_STREET_EXPORT_SIZE="$street_export_size" \
PELIAS_VALHALLA_IMAGE="$valhalla_image" \
python3 - <<'PY'
import datetime
import hashlib
import json
import os
import subprocess
import urllib.request

artifact_path = os.environ["PELIAS_ARTIFACT_PATH"]

def request_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:9200{path}", timeout=30) as response:
        return json.load(response)

def image_record(name):
    try:
        value = json.loads(subprocess.check_output(
            ["docker", "image", "inspect", name],
            text=True,
        ))[0]
        return {
            "configured": name,
            "id": value.get("Id"),
            "repoDigests": value.get("RepoDigests") or [],
        }
    except Exception as error:
        return {"configured": name, "error": str(error)}

with open(artifact_path, "rb") as file:
    digest = hashlib.file_digest(file, "sha256").hexdigest()

index_stats = request_json("/pelias/_stats/docs,store")["indices"]["pelias"]
snapshot = request_json(
    f'/_snapshot/planisfy/{os.environ["PELIAS_SNAPSHOT_NAME"]}'
)["snapshots"][0]
images = [
    image_record(name)
    for name in (
        "pelias/elasticsearch:7.17.27",
        "pelias/api:master",
        "pelias/placeholder:master",
        "pelias/pip-service:master",
        "pelias/libpostal-service:latest",
        "pelias/whosonfirst:master",
        "pelias/geonames:master",
        "pelias/openaddresses:master",
        "pelias/openstreetmap:master",
        "pelias/polylines:master",
    )
]

manifest = {
    "schemaVersion": 1,
    "profile": "planet_geocoder",
    "profileVersion": 1,
    "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "source": {
        "url": os.environ["PELIAS_SOURCE_URL"],
        "date": os.environ["PELIAS_SOURCE_DATE"],
        "size": int(os.environ["PELIAS_SOURCE_SIZE"]),
        "sha256": os.environ["PELIAS_SOURCE_SHA256"],
    },
    "peliasDockerCommit": os.environ["PELIAS_DOCKER_COMMIT"],
    "streetData": {
        "sourceArtifact": {
            "buildId": os.environ["PELIAS_STREET_SOURCE_BUILD_ID"],
            "sha256": os.environ["PELIAS_STREET_SOURCE_SHA256"],
            "valhallaImage": os.environ["PELIAS_VALHALLA_IMAGE"],
        },
        "export": {
            "sha256": os.environ["PELIAS_STREET_EXPORT_SHA256"],
            "size": int(os.environ["PELIAS_STREET_EXPORT_SIZE"]),
        },
    },
    "importers": [
        "whosonfirst",
        "geonames",
        "openaddresses",
        "openstreetmap",
        "polylines",
    ],
    "excludedImporters": ["interpolation", "transit"],
    "index": {
        "name": "pelias",
        "documentCount": index_stats["total"]["docs"]["count"],
        "deletedDocumentCount": index_stats["total"]["docs"]["deleted"],
        "storeBytes": index_stats["total"]["store"]["size_in_bytes"],
    },
    "snapshot": {
        "repository": "planisfy",
        "name": snapshot["snapshot"],
        "uuid": snapshot["uuid"],
        "state": snapshot["state"],
        "indices": snapshot["indices"],
        "shards": snapshot["shards"],
        "startTime": snapshot["start_time"],
        "endTime": snapshot["end_time"],
    },
    "artifact": {
        "fileName": os.path.basename(artifact_path),
        "size": os.path.getsize(artifact_path),
        "sha256": digest,
        "contentType": "application/x-tar",
    },
    "images": images,
}

with open(os.environ["PELIAS_MANIFEST_PATH"], "w", encoding="utf-8") as file:
    json.dump(manifest, file, indent=2)
    file.write("\n")
PY

sha256sum "$manifest_path" >"${manifest_path}.sha256"
echo "ARTIFACT_READY"
echo "artifact=$artifact_path"
echo "manifest=$manifest_path"
