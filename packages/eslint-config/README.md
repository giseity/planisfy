# Planisfy ESLint Config

Shared ESLint configuration for the Planisfy monorepo.

> **Implementation Status**: ✅ Complete

---

## Overview

Provides consistent ESLint rules across all apps and packages.

---

## Installation

```bash
pnpm add -D @planisfy/eslint-config
```

---

## Usage

In your `eslint.config.js`:

```javascript
import config from '@planisfy/eslint-config';

export default [
  ...config,
  // Your custom rules
];
```

---

## Configs

| Export | Purpose |
|--------|---------|
| `base` | Base ESLint rules for TypeScript |
| `next-js` | Next.js specific rules |
| `react-internal` | Internal React rules |
