#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <elasticsearch-snapshot-repository-dir> <output.tar.gz>" >&2
  exit 64
fi

repository_dir=$1
output_path=$2

if [ ! -d "$repository_dir" ]; then
  echo "snapshot repository directory does not exist: $repository_dir" >&2
  exit 66
fi

if [ ! -f "$repository_dir/index.latest" ] &&
  ! find "$repository_dir" -maxdepth 1 -type f -name 'index-[0-9]*' -print -quit | grep -q .; then
  echo "snapshot repository metadata is missing from: $repository_dir" >&2
  exit 65
fi

output_dir=$(dirname "$output_path")
output_name=$(basename "$output_path")
mkdir -p "$output_dir"

temporary_path="${output_path}.partial"
trap 'rm -f "$temporary_path"' EXIT

tar -C "$repository_dir" -czf "$temporary_path" .
mv "$temporary_path" "$output_path"
trap - EXIT

sha256sum "$output_path" | tee "${output_path}.sha256"
printf 'artifact=%s\n' "$output_path"
printf 'size=%s\n' "$(stat -c '%s' "$output_path")"
