FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PLAYWRIGHT_BROWSERS_PATH="/ms-playwright"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/static-renderer/package.json apps/static-renderer/
COPY packages/env/package.json packages/env/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter static-renderer...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/static-renderer/node_modules ./apps/static-renderer/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter static-renderer build

FROM base AS runner
WORKDIR /app/apps/static-renderer
ENV NODE_ENV=production

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/static-renderer/node_modules ./node_modules
COPY --from=build /app/apps/static-renderer/dist ./dist
COPY --from=build /app/apps/static-renderer/package.json ./

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    npx playwright install --with-deps chromium && \
    chmod -R 755 /ms-playwright && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 4300
CMD ["node", "dist/index.js"]
