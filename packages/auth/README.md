# Planisfy Auth

Shared authentication package using **better-auth** for the Planisfy platform.

---

## Overview

Provides unified authentication across the monorepo:
- Email/password authentication
- API key generation and validation
- Session management (JWT)
- Role-based access control (RBAC)
- Password reset via email
- Works across Fastify (API) + Next.js (Dashboard)

---

## Why better-auth?

| Feature | better-auth | NextAuth.js |
|---------|-------------|-------------|
| Monorepo-friendly | ✅ | ⚠️ Next.js only |
| Framework-agnostic | ✅ | ❌ |
| Built-in API keys | ✅ | ❌ |
| TypeScript-first | ✅ | Partial |

---

## Key Features

### Authentication
- Email/password with bcrypt (12 rounds)
- Session management (JWT cookies)
- API key generation (format: `plan_XXXXXXXX_...`)
- API key validation

### Role Management
- User roles: `user`, `admin`, `owner`
- Role hierarchy for permissions
- Role stored in session for quick access

---

## Usage

### In Fastify (API)

```typescript
import { auth } from "@planisfy/auth";

// API key validation
const result = await auth.api.validateApiKey(apiKey);
```

### In Next.js (Dashboard)

```typescript
import { auth } from "@planisfy/auth";

// Get session
const session = await auth();

// Check user role
if (session?.user.role === "admin") {
  // Admin logic
}
```

---

## Environment Variables

```bash
BETTER_AUTH_SECRET=your-secret-key-min-32-chars
BETTER_AUTH_URL=http://localhost:3001/auth

# OAuth (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Email
RESEND_API_KEY=re_...
```

---

## See Also

- [RBAC Architecture](../../docs/RBAC_ARCHITECTURE.md)
- [Database Package](../database/README.md)
