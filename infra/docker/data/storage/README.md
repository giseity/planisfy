# Local storage

Docker Compose mounts this directory into API and geodata worker containers at
`/data/storage` when `STORAGE_PROVIDER=local`.

Expected subdirectories:

- `uploads/` for incoming geodata uploads
- `styles/` for published/demo style JSON
- `fixtures/` for tiny documentation fixtures
