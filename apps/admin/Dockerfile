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
ENV BETTER_AUTH_SECRET=local-dev-only-q1GU3s78xL8bYh6xWQ6xZTbu48rG49TE
ENV INTERNAL_API_SECRET=local-dev-only-K4cSj9SNn7wHvpa86LkDe3br9v9j5C3p
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_AUTH_ORIGIN=http://localhost:3003
ARG NEXT_PUBLIC_CONSOLE_URL=http://localhost:3001
ARG NEXT_PUBLIC_MARKETING_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_ORIGIN=$NEXT_PUBLIC_AUTH_ORIGIN
ENV NEXT_PUBLIC_CONSOLE_URL=$NEXT_PUBLIC_CONSOLE_URL
ENV NEXT_PUBLIC_MARKETING_URL=$NEXT_PUBLIC_MARKETING_URL
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
COPY --from=build --chown=nextjs:nodejs /app/apps/admin/public ./apps/admin/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/admin/server.js"]
