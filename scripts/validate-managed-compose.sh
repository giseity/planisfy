#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/docker-compose.dokploy.yml"
env_file="$repo_root/infra/docker/managed.env.example"

cd "$repo_root"

docker compose --env-file "$env_file" -f "$compose_file" config --format json \
  | node scripts/validate-managed-next-public.mjs

if rg -q '^[[:space:]]+ports:' "$compose_file"; then
  echo "Managed services must not publish host ports; ingress belongs to Dokploy." >&2
  exit 1
fi

if ! rg -q 'PELIAS_INTERNAL_URL: http://pelias:4000' "$compose_file"; then
  echo "The managed API must use the bundled Pelias service name." >&2
  exit 1
fi

for service in placeholder pip libpostal; do
  if ! docker compose --env-file "$env_file" -f "$compose_file" config --services \
    | rg -qx "$service"; then
    echo "The managed planet geocoder profile requires the $service service." >&2
    exit 1
  fi

  if ! node -e "
    const config = require('$repo_root/infra/docker/configs/pelias-runtime.json');
    const url = config.api?.services?.['$service']?.url;
    if (typeof url !== 'string' || !url.startsWith('http://$service:')) process.exit(1);
  "; then
    echo "The managed Pelias runtime configuration must enable the $service service." >&2
    exit 1
  fi
done

if ! node -e "
  const config = require('$repo_root/infra/docker/configs/pelias-runtime.json');
  if (config.imports?.whosonfirst?.datapath !== '/data/whosonfirst') process.exit(1);
"; then
  echo "The managed Pelias PIP service requires the Who's On First SQLite data path." >&2
  exit 1
fi

if ! rg -q 'name: geobble-planisfy' "$compose_file"; then
  echo "The shared Geobble-Planisfy network contract is missing." >&2
  exit 1
fi

echo "Managed Compose configuration is valid."
