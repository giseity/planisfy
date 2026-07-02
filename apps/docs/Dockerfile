FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/docs/package.json apps/docs/
COPY apps/docs/source.config.ts apps/docs/
COPY apps/docs/content apps/docs/content
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter docs...

FROM base AS build
WORKDIR /app
COPY --from=deps /app ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://planisfy:planisfy@postgres:5432/planisfy
ENV BETTER_AUTH_SECRET=local-dev-only-q1GU3s78xL8bYh6xWQ6xZTbu48rG49TE
ENV INTERNAL_API_SECRET=local-dev-only-K4cSj9SNn7wHvpa86LkDe3br9v9j5C3p
ARG NEXT_PUBLIC_AUTH_ORIGIN=http://localhost:3002
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_CONSOLE_URL=http://localhost:3001
ENV NEXT_PUBLIC_AUTH_ORIGIN=$NEXT_PUBLIC_AUTH_ORIGIN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CONSOLE_URL=$NEXT_PUBLIC_CONSOLE_URL
RUN pnpm --filter docs build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/docs/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/docs/public ./apps/docs/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/docs/server.js"]
