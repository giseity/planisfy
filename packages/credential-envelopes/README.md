# Planisfy Credentials

Shared credential envelope helpers for API and worker code.

## Owns

- AES-256-GCM JSON credential envelope encryption and decryption.
- Shared secret-to-key derivation, including `base64:` 32-byte keys.

## Does Not Own

- Where secrets come from in each app.
- Database persistence of encrypted payloads.
- Provider-specific credential schemas.

## Important Commands

```bash
pnpm -F @planisfy/credentials check-types
pnpm -F @planisfy/credentials test
pnpm -F @planisfy/credentials lint
```
