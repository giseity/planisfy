FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/elevation/package.json apps/elevation/
COPY packages/env/package.json packages/env/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter elevation...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/elevation/node_modules ./apps/elevation/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter elevation build

FROM base AS runner
WORKDIR /app/apps/elevation
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 elevation
USER elevation

COPY --from=build --chown=elevation:nodejs /app/node_modules /app/node_modules
COPY --from=build --chown=elevation:nodejs /app/packages /app/packages
COPY --from=build --chown=elevation:nodejs /app/apps/elevation/node_modules ./node_modules
COPY --from=build --chown=elevation:nodejs /app/apps/elevation/dist ./dist
COPY --from=build --chown=elevation:nodejs /app/apps/elevation/package.json ./

EXPOSE 8080
CMD ["node", "dist/index.js"]
