# Planisfy Database

Shared database schema, migrations, and client using Drizzle ORM.

> **Implementation Status**: 🟡 Package.json created, implementation pending

---

## Overview

Provides:
- Database schema definitions
- Type-safe queries
- Migration management
- Seed scripts

---

## Why Drizzle ORM?

| Feature | Drizzle | Prisma |
|---------|---------|--------|
| Bundle size | ~50KB | ~500KB |
| Type safety | ✅ | ✅ |
| Performance | Faster | Slower |
| SQL-like queries | ✅ | ❌ |
| Migration control | Full | Partial |

---

## Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts with RBAC roles |
| `accounts` | OAuth provider accounts |
| `sessions` | User sessions |
| `api_keys` | API keys with scopes |
| `usage_logs` | Request tracking |
| `audit_logs` | Admin action logging |

---

## Role-Based Access Control

Users table includes `role` field for RBAC:
- `user` - Regular user
- `admin` - Instance administrator
- `owner` - Billing contact (future)

---

## Usage

```typescript
import { db } from '@planisfy/database';
import { users } from '@planisfy/database/drizzle/schema';
import { eq } from 'drizzle-orm';

// Query with join
const user = await db.query.users.findFirst({
  where: eq(users.email, 'user@example.com'),
  with: {
    apiKeys: true,
  },
});
```

---

## Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@host:5432/planisfy
```

---

## See Also

- [Drizzle Docs](https://orm.drizzle.team/)
- [RBAC Architecture](../../docs/RBAC_ARCHITECTURE.md)
