# Planisfy Docs

Fumadocs/Next.js documentation app for Planisfy's public API docs, migration guides, and self-hosting guides.

## Owns

- Public docs content under `content/docs`.
- API reference pages.
- Self-hosting and migration guides.
- LLM text routes and Open Graph docs images.

## Does Not Own

- Durable internal architecture references; those live under root `docs/`.
- Marketing pages.
- Runtime API behavior.

## Important Commands

```bash
pnpm -F docs dev
pnpm -F docs check-types
pnpm -F docs build
pnpm -F docs start
```

Default port: `3002`.

## Gotchas

- The docs app uses generated `.source/` and `.next/` output; those should stay untracked.
- Root `docs/` is now reserved for durable engineering docs and must not be ignored globally.
