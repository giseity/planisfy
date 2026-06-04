FROM node:22-slim AS base
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
