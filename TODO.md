# Planisfy — Remaining Work & Improvements

Practical roadmap of what's missing, what could be better, and what to
prioritize next. Organized by priority tier.

---

## Tier 1 — Missing Core Features

Features users will expect on day one. Ship these before public beta.

### Organization Management (Console)

No UI exists for managing organizations. The better-auth org plugin
provides the backend, but the console has no pages to use it.

**Pages needed:**

- `/studio/org` — org overview (name, slug, member count, plan)
- `/studio/org/members` — member table with role badges, invite dialog,
  change role, remove member
- `/studio/org/settings` — name, slug, logo upload, danger zone (transfer
  ownership, delete org)

**Also missing:**

- Context switcher in the top nav (dropdown to switch between personal
  account and organizations the user belongs to)
- The `ownerId` on resources (styles, keys, sources) should follow the
  active context, but there's no UI to switch it

**Effort:** ~12-16 hours

---

### Profile & Account Settings

The `/studio/settings` page only shows billing. There is no way for
users to manage their own account.

**Needs:**

- Profile tab: display name, handle (`@handle`), avatar upload, bio
- Account tab: change password, email notification preferences
- Danger zone: delete account (type email to confirm)
- Backend endpoints: `GET/PUT /console/profile`,
  `PUT /console/profile/password`, `DELETE /console/profile`

**Effort:** ~8-10 hours

---

### Password Reset

No forgot-password flow exists. The sign-in page has no "Forgot
password?" link.

**Needs:**

- `/reset-password` page with email input
- "Check your inbox" success state
- `/reset-password/[token]` page with new password + confirm fields
- Wire to better-auth's built-in password reset (it handles token
  generation and validation)
- Email template already exists in `apps/api/src/lib/email.ts`
  (`passwordReset`), just needs the UI trigger

**Effort:** ~4 hours

---

### Session Management UI

Users have no way to see or revoke their active sessions. better-auth
already provides session listing and revocation, but there's no UI.

**Needs:**

- Section in `/studio/settings` (Account tab) showing active sessions
- Table: device/browser, IP address, last active, created date
- "Revoke" button per session (except current)
- "Revoke all other sessions" button
- Uses better-auth's built-in `listSessions` and `revokeSession`

**Effort:** ~3-4 hours

---

### Email Verification

Users can sign up without verifying their email. better-auth supports
email verification, but it's not enforced.

**Needs:**

- Enable `emailVerification` in better-auth config
- "Verify your email" banner on console pages when unverified
- Resend verification email button
- Block certain actions (create org, publish style) until verified

**Effort:** ~3-4 hours

---

## Tier 2 — Polish & Completeness

Features that make the product feel finished. Ship before marketing push.

### Style Listing Improvements

The current listing is functional but basic compared to the spec.

**Missing:**

- Search/filter input (filter by name)
- Sort dropdown: "Last modified" / "Name A-Z" / "Created"
- Grid/list view toggle
- Thumbnail images (currently shows a letter placeholder)
  - Requires either static map rendering or a screenshot-on-save approach
- Owner badge when viewing org styles
- "Copy style URL" action in the menu
- Bulk actions (select multiple, delete)

**Effort:** ~6-8 hours

---

### Style Version History

The `version` column increments on every save, but there's no way to
browse or restore past versions.

**Needs:**

- `GET /console/styles/:id/versions` endpoint
- Side panel or modal listing past versions (number, timestamp, change
  summary)
- "Restore this version" action
- Optional: diff view between two versions (stretch goal)
- Requires storing version snapshots — currently only the latest JSON is
  kept. Either store full snapshots in a `style_versions` table or use
  JSON diffs.

**Effort:** ~10-12 hours (depends on storage approach)

---

### Theme Toggle

The product spec calls for light/dark/system theme support.

**Needs:**

- Theme provider wrapping the console app (next-themes)
- Toggle in user avatar dropdown menu
- Persist preference in localStorage
- The style editor already handles dark mode via Tailwind, so this is
  mostly wiring

**Effort:** ~2 hours

---

### Loading & Empty States

Some pages lack proper loading skeletons and empty states.

**Audit:**

| Page | Loading | Empty State |
|------|---------|-------------|
| Styles listing | Skeleton | Has empty state |
| API Keys | "Loading..." text | No empty state |
| Usage | "Loading..." text | No empty state |
| Settings | "Loading..." text | N/A |
| Sources | "Loading..." text | Has empty state |
| Admin pages | Server components (no skeleton) | Missing |

**Needs:**

- Replace "Loading..." text with skeleton components (shadcn Skeleton)
- Add empty states with icon + message + CTA to keys and usage pages

**Effort:** ~3-4 hours

---

### Notification Toasts

Success/error feedback is inconsistent. Some actions use `alert()`,
others silently succeed.

**Needs:**

- Add sonner or shadcn toast component
- Replace all `alert()` calls with proper toasts
- Add success toasts for: style saved, key created, key revoked, source
  uploaded, settings updated
- Add error toasts for API failures with retry hints

**Effort:** ~3 hours

---

## Tier 3 — Quality & Reliability

Technical improvements that reduce risk and improve maintainability.

### Tests

There are zero test files in the entire codebase. This is the single
biggest risk factor.

**Recommended approach:**

1. **API integration tests** (highest value per effort)
   - Use Hono's `app.request()` for in-process testing
   - Test auth middleware, key validation, rate limiting
   - Test style CRUD with ownership checks
   - Test billing endpoint responses
   - Framework: vitest (already compatible with the stack)

2. **Database tests**
   - Test schema constraints (unique handles, soft deletes)
   - Test complex queries (usage aggregations, billing calculations)
   - Use a test database or transactions with rollback

3. **Component tests** (lower priority)
   - Style editor store (undo/redo, layer operations)
   - Property panel field components
   - Framework: vitest + @testing-library/react

4. **E2E tests** (lowest priority, highest maintenance)
   - Sign up → create style → edit → publish flow
   - API key creation → use key → check usage
   - Framework: Playwright

**Recommended minimum before launch:** API integration tests for auth,
keys, styles, and billing (~20-30 tests).

**Effort:** ~16-20 hours for meaningful coverage

---

### Input Validation Gaps

Most API endpoints have Zod validation, but a few don't.

**Check these:**

- `POST /console/sources` — validates format but not all fields
- `POST /billing/checkout` — validates `priceId` presence but not format
- Geocoding/routing proxy endpoints pass user input to upstream services
  without sanitization (low risk since they're proxies, but worth
  auditing)

**Also consider:**

- Add response validation in development mode (catch schema drift early)
- Add `Content-Type` checking middleware for POST/PUT routes

**Effort:** ~4 hours

---

### Error Handling Centralization

Each route handles errors individually with copy-pasted patterns.

**Improvement:**

```ts
// Hono onError handler in app.ts
app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: { code: "VALIDATION_ERROR", ... } }, 400);
  if (err instanceof AuthError) return c.json({ error: { code: "UNAUTHORIZED", ... } }, 401);
  logger.error("unhandled", { error: err.message, path: c.req.path });
  return c.json({ error: { code: "INTERNAL_ERROR", ... } }, 500);
});
```

This removes try/catch boilerplate from individual routes and ensures
consistent error responses.

**Effort:** ~3 hours

---

### React Error Boundaries

No error boundaries in the console or admin apps. A single component
crash takes down the entire page.

**Needs:**

- Root-level error boundary wrapping the app (catch-all with "Something
  went wrong" + reload button)
- Editor-specific error boundary (isolate map/panel crashes from the
  rest of the UI)
- Error boundaries around async server components (Next.js `error.tsx`
  files)

**Effort:** ~2-3 hours

---

### Request ID Correlation

No way to trace a request across API logs, usage logs, and audit events.

**Needs:**

- Middleware that generates a `X-Request-Id` (UUID) on every request
- Pass it through to the structured logger context
- Include it in usage log entries and audit events
- Return it in the response header (useful for user-reported issues)

**Effort:** ~2 hours

---

### Billing Plan Enforcement Completion

Rate limiting middleware always falls back to `prod_free` plan limits
(hardcoded). The billing integration with Polar exists but plan
resolution isn't wired up.

**Needs:**

- Resolve the user's actual plan from their Polar subscription (or a
  cached plan field on the user/org record)
- Pass the resolved plan into the rate limiter and quota middleware
- Handle plan changes mid-billing-cycle (upgrade = immediate, downgrade
  = end of period)
- Webhook handler to update cached plan on subscription changes

**Effort:** ~4-6 hours

---

### Type Safety on API Boundary

API responses are untyped — `c.json({ ... })` with no interface.

**Improvement:**

- Define response types in `@planisfy/types` (e.g., `StyleListResponse`,
  `KeyCreateResponse`)
- Use them in both API routes and the console API client
- This catches breaking changes at compile time instead of runtime

**Effort:** ~6-8 hours

---

### `any` Type Cleanup

~8 instances of `any` across the codebase, mostly in catch blocks and
enum filters.

**Files:**

- `routes/health.ts` — `catch (err: any)` x4 → use `unknown` + type guard
- `routes/elevation.ts` — `data: any` → define elevation API response type
- `admin/users/page.tsx` — `as any` cast on role filter → proper enum type

**Effort:** ~1-2 hours

---

## Tier 4 — Production Hardening

For when you're preparing for real traffic.

### Rate Limiting Improvements

The current rate limiter works but has gaps.

**Consider:**

- Per-IP rate limiting for unauthenticated endpoints (health, auth)
- Separate rate limits for auth endpoints (prevent brute force)
- Rate limit the `/api/auth/sign-in/email` endpoint specifically
  (login attempts)
- Add `Retry-After` header on quota exceeded responses (currently only
  on rate limit)

---

### Security Headers

No security headers are set on API responses.

**Add via Hono middleware:**

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (production only)
- `X-Request-Id` on every response (for debugging and support)
- CORS: review allowed origins for production (currently hardcoded to
  localhost:3001 and console.planisfy.com)

---

### CORS Production Configuration

CORS is currently hardcoded to `localhost:3001` and
`console.planisfy.com`. Before production, review and configure
properly.

**Needs:**

- Environment-variable-driven allowed origins
- Separate CORS config for public API (allow customer domains via API
  key's `allowedDomains`) vs console endpoints (only planisfy domains)
- Ensure preflight (`OPTIONS`) responses are cached

---

### Two-Factor Authentication (2FA)

No 2FA support. better-auth has a `twoFactor` plugin that supports
TOTP (authenticator apps).

**Needs:**

- Enable `twoFactor` plugin in better-auth config
- Settings page: enable/disable 2FA with QR code setup
- Login flow: prompt for TOTP code after password
- Recovery codes generation and display
- Admin override to disable 2FA for locked-out users

**Effort:** ~6-8 hours

---

### Database Backup Strategy

No backup strategy documented or automated.

**Needs:**

- Automated `pg_dump` on a schedule (cron or managed service)
- Backup retention policy (daily for 7 days, weekly for 4 weeks)
- Test restore procedure documented
- For managed Postgres (e.g., RDS, Supabase): enable automated backups
  with point-in-time recovery

---

### Accessibility Audit

No accessibility considerations in the console or admin apps.

**Minimum:**

- Keyboard navigation through all interactive elements
- ARIA labels on icon-only buttons (toolbar, actions)
- Focus management in dialogs and modals
- Color contrast checks (especially in the style editor)
- Screen reader support for status messages (toasts, banners)

**Effort:** ~8-10 hours

---

### Static Map Rendering

Currently returns an SVG placeholder. For a real mapping platform, this
needs actual rendering.

**Options (pick one):**

1. `@maplibre/maplibre-gl-native` — fastest, no browser dependency, but
   limited style support and harder to install (native binaries)
2. Puppeteer/Playwright + MapLibre GL JS — slower but pixel-perfect,
   supports all style features
3. Third-party service — offload to a tile rendering service

**Also needed:**

- Auto-generate thumbnails on style publish (for the listing page)
- Cache rendered images in storage (S3/R2/local)
- Queue thumbnail generation via BullMQ to avoid blocking

---

### Monitoring & Alerting

The health endpoint exists but nothing watches it.

**Consider:**

- Uptime monitoring (UptimeRobot, Better Stack, or self-hosted)
- Error tracking (Sentry — has a free tier)
- Log aggregation in production (ship JSON logs to Loki, Datadog, or
  similar)
- Alert on: health check failures, error rate spike, quota threshold
  crossed

---

### Database

**Missing operational basics:**

- No migration files — using `drizzle-kit push` (fine for dev, risky for
  production). Generate proper migration files with `drizzle-kit generate`
  before deploying.
- No database backups strategy documented
- No connection pooling configuration (the default postgres.js pool may
  not be tuned for production load)
- Consider adding `pg_stat_statements` for query performance monitoring
- Add database indexes audit — check that all WHERE/JOIN columns are
  indexed

---

### Secrets Management

Secrets are in `.env` files (gitignored). Fine for local dev.

**For production:**

- Use a secrets manager (AWS Secrets Manager, Doppler, Infisical, or
  even encrypted env vars in CI)
- The `BETTER_AUTH_SECRET` is critical — rotate it = invalidate all
  sessions
- API key hashes use SHA-256 — document that changing the hashing
  approach requires re-hashing all keys (migration)

---

## Tier 5 — Nice to Have

Low priority, but would differentiate the product.

### Collaborative Editing

- Real-time presence (show who else is editing a style)
- Lock mechanism or operational transforms for concurrent edits
- This is complex — only worth doing if multi-user editing is a real use
  case

### SDK / Client Libraries

- `@planisfy/js` — JavaScript/TypeScript SDK for tiles, geocoding,
  routing
- Auto-generated from API route definitions (or OpenAPI spec)
- Published to npm

### OpenAPI Spec

- Generate from Hono routes using `@hono/zod-openapi`
- Serves as both documentation and SDK generation source
- Interactive API explorer in the docs app

### Webhook System

- Let users register webhooks for events (source processed, quota
  warning, key expiring)
- Event delivery with retry and signature verification

### Marketing Site

- The landing page is a skeleton. Needs hero section with live map demo,
  feature grid, pricing table, social proof.
- `/pricing` page with plan comparison
- Consider building this last — the product matters more than the
  marketing site at this stage

---

## Summary

| Tier | Hours | Items |
|------|-------|-------|
| 1 — Missing core features | ~35h | Org mgmt, profile, password reset, email verification, session mgmt |
| 2 — Polish | ~25h | Style listing, versions, theme, loading states, toasts |
| 3 — Quality | ~50h | Tests, validation, error handling, types, error boundaries, request IDs, billing enforcement |
| 4 — Production | ~45h | Security headers, CORS, 2FA, backups, a11y, monitoring, migrations, rendering |
| 5 — Nice to have | Open | SDK, webhooks, collab editing, marketing |

**Recommended order:** Tier 1 → Tier 3 (tests) → Tier 2 → Tier 4 → Tier 5
