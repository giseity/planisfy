FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/root-agent/package.json apps/root-agent/
COPY packages/env/package.json packages/env/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter root-agent...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/root-agent/node_modules ./apps/root-agent/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter root-agent build

FROM base AS runner
WORKDIR /app/apps/root-agent
ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl gzip tar && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/root-agent/node_modules ./node_modules
COPY --from=build /app/apps/root-agent/dist ./dist
COPY --from=build /app/apps/root-agent/package.json ./

CMD ["node", "dist/index.js"]
