# Planisfy Web

Landing page and marketing website for Planisfy.

> **Implementation Status**: 🟡 Default Next.js app, customization pending

---

## Overview

The public-facing website for Planisfy, deployed at **https://planisfy.com**.

Built with [Next.js 14](https://nextjs.org) using the App Router.

---

## Purpose

- **Marketing**: Product information, features, pricing
- **SEO**: Public search engine visibility
- **Conversion**: Sign up and get started CTAs
- **Resources**: Blog, case studies, documentation links

---

## Key Sections

| Route | Purpose |
|-------|---------|
| `/` | Hero, features overview |
| `/features` | Detailed feature list |
| `/pricing` | Pricing plans |
| `/docs` | Link to documentation (docs app) |
| `/dashboard` | Link to dashboard (dashboard app) |

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **Styling** | Tailwind CSS |
| **Components** | Radix UI |
| **Animations** | Framer Motion |
| **Hosting** | Vercel |

---

## Development

```bash
pnpm install
pnpm dev      # Port 3000
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

## Related Apps

- **[apps/docs](../docs/)** - Technical documentation (Fumadocs)
- **[apps/dashboard](../dashboard/)** - User dashboard (authenticated)
- **[apps/api](../api/)** - API gateway
