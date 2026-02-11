# Planisfy Documentation

Public API documentation and guides built with Docusaurus.

---

## Overview

Official documentation site for Planisfy, deployed at **https://docs.planisfy.com**.

Built with [Docusaurus](https://docusaurus.io/).

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
| **Framework** | Docusaurus |
| **Hosting** | Vercel |
| **Language** | MDX |
| **Search** | Algolia DocSearch |

---

## Development

```bash
pnpm install
pnpm start    # Port 3000
pnpm build
pnpm serve
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
