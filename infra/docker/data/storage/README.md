# Local storage

Docker Compose mounts this directory into API and geodata worker containers at
`/data/storage` when `STORAGE_PROVIDER=local`.

Expected subdirectories:

- `uploads/` for incoming geodata uploads
- `styles/` for published/demo style JSON
- `fixtures/` for tiny documentation fixtures
- `martin-sources/` for aliases to published local PMTiles/MBTiles artifacts

Martin also mounts this directory read-only at `/storage`. When a local tileset
version is published, the API writes stable and versioned aliases into
`martin-sources/`, using source IDs such as `owner.tileset` and
`owner.tileset.v2`. Martin watches MBTiles aliases live. PMTiles reload behavior
depends on the Martin version, so restart the Martin container if a newly
published local PMTiles artifact does not appear immediately.
