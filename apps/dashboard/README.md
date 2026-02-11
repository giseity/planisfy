# Planisfy Dashboard

The user-facing web application for managing API keys, viewing usage analytics, and system administration.

---

## Overview

The Dashboard is a **single Next.js application** with **Role-Based Access Control (RBAC)**. All users access the same dashboard, but the interface and available features change based on their role:

| Role | Can Access |
|------|------------|
| **user** | Own API keys, personal usage analytics |
| **admin** | User management, system settings, all usage data |
| **owner** | Billing management (future) |

**See [RBAC_ARCHITECTURE.md](../../docs/RBAC_ARCHITECTURE.md) for complete details.**

---

## Key Features

### Authentication
- Email/password authentication
- Password reset via email
- Session management (JWT cookies)
- Role-based session data
- OAuth2 providers (Google, GitHub) - planned

### API Key Management
- Create, view, revoke, regenerate keys
- Scope keys to specific APIs (tiles, geocoding, routing)
- Rate limiting per key
- Usage tracking per key

### Usage Analytics
- Request count over time
- Endpoint breakdown (tiles vs geocoding vs routing)
- Response time metrics (P50, P95, P99)
- Error rate tracking
- Geographic distribution

### Admin Features (Admin Role Only)
- User management (create, update roles, delete)
- System-wide usage statistics
- Service health monitoring
- Instance configuration

---

## Tech Stack

| Component | Technology | Why? |
|-----------|-----------|------|
| **Framework** | Next.js 14 (App Router) | Server Components, streaming, built-in optimizations |
| **Auth** | better-auth | Framework-agnostic, API keys built-in |
| **Database** | Drizzle ORM + PostgreSQL | Type-safe, SQL-like syntax, great DX |
| **Styling** | Tailwind CSS | Utility-first, consistent design |
| **Charts** | Recharts | React-based, declarative charts |
| **UI Components** | Radix UI | Accessible, unstyled primitives |

---

## Pages

| Route | Access | Description |
|-------|--------|-------------|
| `/overview` | All | Personal usage overview and quick stats |
| `/api-keys` | All | Manage own API keys (admins see all users) |
| `/usage` | All | Usage analytics (admins see aggregate data) |
| `/admin/users` | Admin only | User management, role updates |
| `/admin/system` | Admin only | System health, service metrics |
| `/admin/settings` | Admin only | Instance configuration |

---

## Development

```bash
# Install dependencies
pnpm install

# Run dev server (port 3001)
pnpm dev

# Type check
pnpm check-types

# Lint
pnpm lint

# Build for production
pnpm build
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/planisfy

# Auth (better-auth)
BETTER_AUTH_SECRET=your-secret-key-min-32-chars
BETTER_AUTH_URL=http://localhost:3001/auth

# Email (password reset)
RESEND_API_KEY=re_your_api_key

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

---

## Deployment

### Vercel (Recommended)

```bash
vercel --prod
```

### Docker

```bash
docker build -t planisfy-dashboard .
docker run -p 3001:3000 \
  -e DATABASE_URL=... \
  -e BETTER_AUTH_SECRET=... \
  planisfy-dashboard
```

---

## Architecture Notes

- **Server Components** by default for data fetching
- **Client Components** only when needed (interactivity)
- **Server Actions** for mutations (create API key, update settings)
- **Middleware** for route protection
- **RBAC utilities** in `lib/rbac.ts`

---

## Planned Features

- Webhooks configuration
- Team management (invite users)
- Usage alerts (email/SMS thresholds)
- Data export (CSV)
- Audit log viewer
- Dark mode
- 2FA requirement for admins
