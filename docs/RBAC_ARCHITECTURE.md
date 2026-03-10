# Role-Based Access Control (RBAC) Design

## Overview

Planisfy uses **two separate applications** with distinct access models:

- **Console** (`apps/console`) — Customer-facing app for managing styles, API keys, usage, and organizations.
- **Admin** (`apps/admin`) — Internal super-admin app for instance-wide management.

Both apps share authentication via `@planisfy/auth` (shared session cookies on `.planisfy.com`) and UI components via `@planisfy/ui`.

---

## Role Model

### System Roles (on `users` table)

| Role | Description | Access |
|------|-------------|--------|
| **USER** | Regular user | Console only |
| **ADMIN** | Instance administrator | Console + Admin |
| **SUPER** | Platform owner | Console + Admin (full) |

### Organization Roles (on `members` table)

| Role | Description | Permissions |
|------|-------------|-------------|
| **OWNER** | Organization creator | Full org management, billing, delete org |
| **ADMIN** | Org administrator | Manage members, settings, resources |
| **MEMBER** | Regular member | Create/edit own resources |
| **VIEWER** | Read-only | View org resources |

Role hierarchy: higher roles inherit all lower role permissions.

---

## Console App (`apps/console`)

### Route Structure

```
app/
├── (auth)/                 # Public (login, register)
├── (app)/                  # Authenticated routes
│   ├── dashboard/          # Overview, stats
│   ├── api-keys/           # API key management
│   ├── usage/              # Usage analytics
│   ├── styles/             # Style management
│   ├── studio/             # Style editor
│   └── settings/           # Account settings
└── org/[orgId]/            # Organization context
    ├── dashboard/
    ├── members/
    ├── api-keys/
    └── settings/
```

### Access Rules

| Page | USER | ORG MEMBER | ORG ADMIN | ORG OWNER |
|------|------|-----------|-----------|-----------|
| Dashboard | Own stats | Org stats | Org stats | Org stats |
| API Keys | Own keys | Org keys (read) | Org keys (manage) | Org keys (manage) |
| Usage | Own usage | Org usage | Org usage | Org usage + billing |
| Members | — | View | Manage | Manage + invite |
| Settings | Own account | — | Org settings | Org settings + delete |

---

## Admin App (`apps/admin`)

Restricted to users with `ADMIN` or `SUPER` system role.

### Route Structure

```
app/
├── (auth)/                 # Admin login
├── (admin)/                # Protected admin routes
│   ├── dashboard/          # System-wide stats
│   ├── users/              # User management
│   ├── organizations/      # Org management
│   ├── system/             # Health, metrics
│   └── settings/           # Instance settings
```

---

## Security Principles

### Server-Side Authority

- All authorization happens server-side
- Client-side role checks are UX only, not security
- Server Actions and API routes validate roles
- Sessions include role in JWT payload

### Protection Layers

1. **Middleware** — Route-level protection (redirect unauthenticated)
2. **Server Components** — Data fetching with role validation
3. **Server Actions** — Mutation authorization
4. **API Routes** — Endpoint-level guards

---

## Database Schema

### Relevant Tables

```
profiles   — Shared identity (handle, displayName, billing)
users      — Auth identity (email, role: USER | ADMIN | SUPER)
organizations — Org entities (ownerId → users)
members    — User ↔ Org join (role: OWNER | ADMIN | MEMBER | VIEWER)
```

System role lives on `users.role`. Org role lives on `members.role`.

---

## See Also

- [Architecture Overview](../ARCHITECTURE.md)
- [Auth Package](../packages/auth/README.md)
- [Database Package](../packages/database/README.md)
