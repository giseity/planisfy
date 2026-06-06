FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker-geodata/package.json apps/worker-geodata/
COPY packages/database/package.json packages/database/
COPY packages/storage/package.json packages/storage/
COPY packages/storage-paths/package.json packages/storage-paths/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter worker-geodata...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker-geodata/node_modules ./apps/worker-geodata/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter worker-geodata build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG DUCKDB_VERSION=v1.1.3
ARG TIPPECANOE_VERSION=1.36.0

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      g++ \
      gdal-bin \
      libsqlite3-dev \
      make \
      tar \
      unzip \
      zlib1g-dev && \
    curl -fsSL -o /tmp/duckdb.zip "https://github.com/duckdb/duckdb/releases/download/${DUCKDB_VERSION}/duckdb_cli-linux-amd64.zip" && \
    unzip -q /tmp/duckdb.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/duckdb && \
    curl -fsSL -o /tmp/tippecanoe.tar.gz "https://github.com/mapbox/tippecanoe/archive/refs/tags/${TIPPECANOE_VERSION}.tar.gz" && \
    mkdir -p /tmp/tippecanoe && \
    tar -xzf /tmp/tippecanoe.tar.gz -C /tmp/tippecanoe --strip-components=1 && \
    make -C /tmp/tippecanoe -j"$(nproc)" && \
    make -C /tmp/tippecanoe install && \
    rm -rf /var/lib/apt/lists/* /tmp/duckdb.zip /tmp/tippecanoe /tmp/tippecanoe.tar.gz

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker
USER worker

COPY --from=build --chown=worker:nodejs /app/apps/worker-geodata/dist ./dist
COPY --from=build --chown=worker:nodejs /app/apps/worker-geodata/package.json ./
COPY --from=build --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=worker:nodejs /app/packages ./packages

CMD ["node", "dist/index.js"]
