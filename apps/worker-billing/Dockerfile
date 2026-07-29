FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@10.4.1

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker-billing/package.json apps/worker-billing/
COPY packages/env/package.json packages/env/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter worker-billing...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker-billing/node_modules ./apps/worker-billing/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter worker-billing build

FROM base AS runner
WORKDIR /app/apps/worker-billing
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 worker
USER worker
COPY --from=build --chown=worker:nodejs /app/apps/worker-billing/dist ./dist
COPY --from=build --chown=worker:nodejs /app/apps/worker-billing/package.json ./
CMD ["node", "dist/index.js"]
