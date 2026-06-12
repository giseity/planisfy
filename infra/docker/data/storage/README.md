# Local storage

Docker Compose mounts this directory into API and geodata worker containers at
`/data/storage` when `STORAGE_PROVIDER=local`.

Expected subdirectories:

- `uploads/` for incoming geodata uploads
- `styles/` for published/demo style JSON
- `fixtures/` for tiny documentation fixtures
- `martin-sources/` for optional direct-Martin aliases to published local
  PMTiles/MBTiles artifacts

Uploaded tilesets are served through API-owned `/tiles/v1/{owner}/{handle}`
URLs. If a local deployment also wants direct Martin source IDs, point
`MARTIN_SOURCES_PATH` at a directory mounted into Martin and use aliases such as
`owner.tileset` and `owner.tileset.v2`. PMTiles reload behavior depends on the
Martin version, so restart Martin if a newly published local PMTiles alias does
not appear immediately.
