FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/runtime-supervisor/package.json apps/runtime-supervisor/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter runtime-supervisor...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/runtime-supervisor/node_modules ./apps/runtime-supervisor/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter runtime-supervisor build

FROM docker:27-cli AS docker-cli

FROM base AS runner
WORKDIR /app/apps/runtime-supervisor
ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl systemd && \
    rm -rf /var/lib/apt/lists/*

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/runtime-supervisor/node_modules ./node_modules
COPY --from=build /app/apps/runtime-supervisor/dist ./dist
COPY --from=build /app/apps/runtime-supervisor/package.json ./

EXPOSE 4012
CMD ["node", "dist/index.js"]
