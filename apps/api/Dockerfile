FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Install dependencies ─────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
COPY packages/auth/package.json packages/auth/
COPY packages/env/package.json packages/env/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/events/package.json packages/events/
COPY packages/storage/package.json packages/storage/
COPY packages/storage-paths/package.json packages/storage-paths/
COPY packages/style-spec/package.json packages/style-spec/
COPY packages/tile-runtime/package.json packages/tile-runtime/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter api...

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter api build

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hono
USER hono

COPY --from=build --chown=hono:nodejs /app/node_modules /app/node_modules
COPY --from=build --chown=hono:nodejs /app/packages /app/packages
COPY --from=build --chown=hono:nodejs /app/scripts /app/scripts
COPY --from=build --chown=hono:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=build --chown=hono:nodejs /app/apps/api/dist ./dist
COPY --from=build --chown=hono:nodejs /app/apps/api/package.json ./

EXPOSE 4000
CMD ["node", "dist/index.js"]
