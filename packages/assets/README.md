# assets

Reusable assets for app surfaces, generated previews, and launch/social materials.

Use generic asset names inside brand folders because the path already identifies the brand:

- `brand/mark.svg`
- `brand/wordmark.svg`
- `brand/cover.svg`
- `brand/logo-192.png`
- `brand/logo-512.png`

Code imports use `assets/brand`.

Static assets can be imported through the wildcard export, for example
`assets/brand/cover.svg`. New files under `brand/` are automatically exported by
that pattern.

Commands: `pnpm --filter assets check-types`.
