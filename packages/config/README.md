# Planisfy Config

Shared configuration packages for ESLint, TypeScript, and Prettier.

---

## Overview

Provides consistent tooling configuration across the monorepo.

---

## Packages

| Package | Purpose |
|---------|---------|
| `@planisfy/eslint-config` | ESLint rules |
| `@planisfy/tsconfig` | TypeScript configs |
| `@planisfy/prettier-config` | Prettier config |

---

## Installation

```bash
pnpm add -D @planisfy/eslint-config @planisfy/tsconfig @planisfy/prettier-config
```

---

## Usage

### ESLint
```javascript
module.exports = {
  extends: ['@planisfy/eslint-config'],
};
```

### TypeScript
```json
{
  "extends": "@planisfy/tsconfig/base.json"
}
```

### Prettier
```javascript
module.exports = require('@planisfy/prettier-config');
```

---

## Config Rules

- No unused variables (prefix with `_` to ignore)
- No explicit `any` (warn level)
- No console (allowed)
- Strict TypeScript enabled
