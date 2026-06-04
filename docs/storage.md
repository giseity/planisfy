# Storage

## Current

Planisfy has a local/S3-like storage abstraction in the API. Source uploads now use `@planisfy/storage-paths` and write `storage_objects` ledger rows for original and processed artifacts.

## Target

Storage is built from:

- `@planisfy/storage-paths` for object key builders and parsers.
- `storage_objects` as the durable artifact ledger.
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
