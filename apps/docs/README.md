# Planisfy Documentation

Public API documentation and guides built with Fumadocs.

> **Implementation Status**: 🟡 Skeleton ready, Fumadocs CLI setup pending

---

## Overview

Official documentation site for Planisfy, deployed at **https://docs.planisfy.com**.

Built with [Fumadocs](https://fumadocs.vercel.app/) - a modern documentation solution for Next.js.

---

## Documentation Structure

```
docs/
├── api/                    # API reference
│   ├── tiles.md
│   ├── geocoding.md
│   └── directions.md
│
├── guides/                 # How-to guides
│   ├── getting-started.md
│   ├── authentication.md
│   └── map-styles.md
│
├── migration/              # Migration guides
│   └── mapbox.md
│
└── legal/                  # Legal pages
    ├── terms.md
    └── privacy.md
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **Docs Library** | Fumadocs |
| **Styling** | Tailwind CSS |
| **MDX** | fumadocs-mdx |
| **Hosting** | Vercel |
| **Search** | Fumadocs Search (planned) |

---

## Development

```bash
pnpm install
pnpm dev      # Port 3001
pnpm build
pnpm start
```

---

## Deployment

### Vercel
```bash
vercel --prod
```

---

## Internationalization

Planned: French, German, Spanish, Japanese, Chinese
