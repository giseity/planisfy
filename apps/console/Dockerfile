FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Install dependencies ─────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/console/package.json apps/console/
COPY packages/ui/package.json packages/ui/
COPY packages/database/package.json packages/database/
COPY packages/auth/package.json packages/auth/
COPY packages/env/package.json packages/env/
COPY packages/platform-policy/package.json packages/platform-policy/
COPY packages/style-spec/package.json packages/style-spec/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter console...

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://planisfy:planisfy@postgres:5432/planisfy
ENV BETTER_AUTH_SECRET=change-this-secret-in-production-min-32-chars
ENV INTERNAL_API_SECRET=change-this-internal-secret
ENV NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_AUTH_ORIGIN=http://localhost:3001
ENV NEXT_PUBLIC_APP_URL=http://localhost:3001
ENV NEXT_PUBLIC_ADMIN_URL=http://localhost:3003
ENV NEXT_PUBLIC_MARKETING_URL=http://localhost:3000
ENV NEXT_PUBLIC_CONSOLE_API_PATH=/api/v1/console
RUN pnpm --filter console build

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/console/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/console/.next/static ./apps/console/.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/console/server.js"]
