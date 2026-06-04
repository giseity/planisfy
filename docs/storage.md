# Storage

## Current

Planisfy has a local/S3-like storage abstraction in the API and some ad hoc keys such as `uploads/{ownerId}/{sourceId}/{filename}`.

## Target

Storage is built from:

- `@planisfy/storage-paths` for all object key builders and parsers.
- `storage_objects` as the durable ledger.
- A local filesystem provider for simple self-hosting.
- An S3/R2-compatible provider for cloud and advanced self-hosting.

## Storage Object Fields

- account ID
- provider and bucket
- storage key
- file name
- content type
- size
- content hash when available
- resource type and resource ID
- artifact kind
- version
- deleted timestamp
- metadata

## Rules

- Do not construct storage keys inline in route handlers.
- Every durable artifact should have a ledger row.
- Cleanup should be auditable and recoverable.
