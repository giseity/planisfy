# Role-Based Access Control (RBAC) Design

## Overview

Planisfy uses a **single dashboard** with role-based access control. All users access the same application, but the interface and available features change based on their role.

---

## Why Single Dashboard with RBAC?

| Approach | Pros | Cons |
|----------|------|------|
| **Single Dashboard + RBAC** | Simpler deployment, shared components, seamless UX, easier maintenance | Larger bundle size |
| **Separate Admin Panel** | Clear separation, different deployment strategies | More infrastructure, duplicate UI, more complex CI/CD |

**Decision**: Single dashboard is better for self-hosting, where users are typically also admins of their instance.

---

## User Roles

| Role | Level | Description | Permissions |
|------|-------|-------------|------------|
| **user** | 1 | Regular user | Manage own API keys, view own usage |
| **admin** | 2 | Instance administrator | Manage all users, system settings, view all usage |
| **owner** | 3 | Billing contact (future) | Manage billing, plans |

**Role Hierarchy**: Higher roles inherit lower role permissions.

---

## Role-Based UI

### Sidebar Navigation

The sidebar dynamically renders based on user role:

```
All Users See:
├── Overview
├── API Keys
└── Usage

Admins Also See:
├── ────────────────
├── Users
├── System
└── Settings
```

### Page Content

| Page | Regular Users | Admins |
|------|-------------|--------|
| **Overview** | Personal stats | System-wide stats |
| **Usage** | Own data only | Aggregate + per-user breakdown |
| **API Keys** | Own keys only | All users' keys (manage) |
| **Users** | Hidden | ✅ Visible (user management) |
| **System** | Hidden | ✅ Visible (health, metrics) |

---

## Security Principles

### Server-Side Authority

- **All authorization happens server-side**
- Client-side role checks are UX only, not security
- Server Actions and API routes validate roles
- Sessions include role in JWT payload

### Protection Layers

1. **Middleware** - Route-level protection
2. **Server Components** - Data fetching with role validation
3. **Server Actions** - Mutation authorization
4. **API Routes** - Endpoint-level guards

### Audit Logging

Admin actions are logged:
- User role changes
- User deletion
- Settings modifications
- Login attempts

---

## Implementation Approach

### Route Structure

```
app/
├── (auth)/           # Public (login, register)
├── (dashboard)/      # Protected (all authenticated users)
│   ├── overview/
│   ├── api-keys/
│   └── usage/
│   └── admin/        # Admin-only routes
│       ├── users/
│       ├── system/
│       └── settings/
```

### Protection Strategy

| Location | Method | Purpose |
|----------|--------|---------|
| **Middleware** | `auth.middleware()` | Redirect unauthenticated |
| **Layout** | Server component check | Block access to protected route groups |
| **Server Action** | `requireRole()` | Validate before mutation |
| **API Route** | Middleware guard | Validate API requests |

---

## Database Schema (Conceptual)

Users table includes:

```
users
├── id
├── email
├── name
├── role (enum: user, admin, owner)  ← RBAC field
├── organization
└── created_at
```

No separate admin tables - role is a property of the user.

---

## Migration Path

1. **Add role column** to users table (default: 'user')
2. **Update auth config** to include role in session
3. **Create RBAC utilities** (`requireRole`, `hasRole`)
4. **Add admin routes** with layout protection
5. **Update UI components** to render based on role
6. **Set first user** as admin (manual database update)

---

## Future Enhancements

- **Fine-grained permissions**: `users:read`, `users:write`, `system:configure`
- **Teams/Organizations**: Admin per organization, not global
- **Audit log viewer**: View all admin actions in dashboard
- **Impersonation**: Admins can view as another user (for support)
- **2FA requirement**: Require 2FA for admin access
- **Role expiry**: Temporary admin access for specific tasks

---

## See Also

- [Architecture Overview](../ARCHITECTURE.md)
- [Dashboard Implementation](../apps/dashboard/README.md)
- [Auth Package](../packages/auth/README.md)
- [Database Package](../packages/database/README.md)
