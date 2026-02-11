# Planisfy Prettier Config

Shared Prettier configuration for the Planisfy monorepo.

> **Implementation Status**: ✅ Complete

---

## Overview

Provides consistent code formatting across all apps and packages.

---

## Installation

```bash
pnpm add -D @planisfy/prettier-config
```

---

## Usage

In your `package.json`:

```json
{
  "prettier": "@planisfy/prettier-config"
}
```

Or in `.prettierrc.js`:

```javascript
module.exports = require('@planisfy/prettier-config');
```

---

## Config Options

- Semi-colons: **disabled**
- Quotes: **single**
- Tab width: **2 spaces**
- Trailing commas: **ES5**
- Print width: **100 characters**
