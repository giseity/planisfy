#!/usr/bin/env bash
set -euo pipefail

elasticsearch_url=${ELASTICSEARCH_URL:-http://127.0.0.1:9200}
repository_name=${PELIAS_SNAPSHOT_REPOSITORY:-planisfy}
snapshot_name=${PELIAS_SNAPSHOT_NAME:-}
index_name=${PELIAS_INDEX_NAME:-pelias}

if [ -z "$snapshot_name" ]; then
  echo "PELIAS_SNAPSHOT_NAME is required" >&2
  exit 64
fi

for value in "$repository_name" "$snapshot_name" "$index_name"; do
  if [[ ! "$value" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "repository, snapshot, and index names may contain only letters, numbers, dot, underscore, and dash" >&2
    exit 64
  fi
done

curl -fsS -X PUT "$elasticsearch_url/_snapshot/$repository_name" \
  -H 'content-type: application/json' \
  -d '{"type":"fs","settings":{"location":"/snapshots/repository","compress":true}}'

curl -fsS -X PUT \
  "$elasticsearch_url/_snapshot/$repository_name/$snapshot_name?wait_for_completion=true" \
  -H 'content-type: application/json' \
  -d "{\"indices\":\"$index_name\",\"include_global_state\":false}"

snapshot_json=$(curl -fsS \
  "$elasticsearch_url/_snapshot/$repository_name/$snapshot_name")
SNAPSHOT_JSON="$snapshot_json" node -e '
const payload = JSON.parse(process.env.SNAPSHOT_JSON ?? "{}")
const snapshot = payload.snapshots?.[0]
if (!snapshot || snapshot.state !== "SUCCESS") {
  console.error(JSON.stringify(payload))
  process.exit(1)
}
console.log(JSON.stringify({
  snapshot: snapshot.snapshot,
  state: snapshot.state,
  indices: snapshot.indices,
  startTime: snapshot.start_time,
  endTime: snapshot.end_time,
  shards: snapshot.shards,
}, null, 2))
'
