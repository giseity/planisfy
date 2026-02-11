# Planisfy TypeScript Config

Shared TypeScript configuration for the Planisfy monorepo.

> **Implementation Status**: ✅ Complete

---

## Overview

Provides consistent TypeScript compiler options across all apps and packages.

---

## Installation

```bash
pnpm add -D @planisfy/typescript-config
```

---

## Usage

In your `tsconfig.json`:

```json
{
  "extends": "@planisfy/typescript-config/base.json",
  "compilerOptions": {
    // Your custom options
  }
}
```

---

## Available Configs

| Config | Purpose |
|--------|---------|
| `base.json` | Base TypeScript configuration |
| `nextjs.json` | Next.js specific configuration |
| `react-library.json` | React library configuration |
