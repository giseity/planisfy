FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/tile-worker/package.json apps/tile-worker/
COPY packages/database/package.json packages/database/
COPY packages/env/package.json packages/env/
COPY packages/storage/package.json packages/storage/
COPY packages/tile-runtime/package.json packages/tile-runtime/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter tile-worker...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/tile-worker/node_modules ./apps/tile-worker/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter tile-worker build

FROM base AS runner
WORKDIR /app/apps/tile-worker
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 tileworker
USER tileworker

COPY --from=build --chown=tileworker:nodejs /app/node_modules /app/node_modules
COPY --from=build --chown=tileworker:nodejs /app/packages /app/packages
COPY --from=build --chown=tileworker:nodejs /app/apps/tile-worker/node_modules ./node_modules
COPY --from=build --chown=tileworker:nodejs /app/apps/tile-worker/dist ./dist
COPY --from=build --chown=tileworker:nodejs /app/apps/tile-worker/package.json ./

EXPOSE 4020
CMD ["node", "dist/index.js"]
