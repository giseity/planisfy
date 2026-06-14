FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json apps/admin/
COPY packages/ui/package.json packages/ui/
COPY packages/database/package.json packages/database/
COPY packages/auth/package.json packages/auth/
COPY packages/env/package.json packages/env/
COPY packages/events/package.json packages/events/
COPY packages/geodata-contracts/package.json packages/geodata-contracts/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter admin...

FROM base AS build
WORKDIR /app
COPY --from=deps /app ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://planisfy:planisfy@postgres:5432/planisfy
ENV BETTER_AUTH_SECRET=change-this-secret-in-production-min-32-chars
ENV INTERNAL_API_SECRET=change-this-internal-secret
ENV NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_AUTH_ORIGIN=http://localhost:3003
RUN pnpm --filter admin build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/admin/server.js"]
