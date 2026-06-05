# Local storage

Docker Compose mounts this directory into API and geodata worker containers at
`/data/storage` when `STORAGE_PROVIDER=local`.

Expected subdirectories:

- `uploads/` for incoming geodata uploads
- `styles/` for published/demo style JSON
- `fixtures/` for tiny documentation fixtures

Martin also mounts this directory read-only at `/storage` so a generated Martin
config can point published uploaded tilesets at their local artifact paths. The
API still owns the publish decision; Martin only serves source names that appear
in its config.
