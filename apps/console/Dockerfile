FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Install dependencies ─────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/console/package.json apps/console/
COPY packages/api-contracts/package.json packages/api-contracts/
COPY packages/assets/package.json packages/assets/
COPY packages/ui/package.json packages/ui/
COPY packages/database/package.json packages/database/
COPY packages/auth/package.json packages/auth/
COPY packages/env/package.json packages/env/
COPY packages/platform-policy/package.json packages/platform-policy/
COPY packages/style-spec/package.json packages/style-spec/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter console...

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://planisfy:planisfy@postgres:5432/planisfy
ENV BETTER_AUTH_SECRET=local-dev-only-q1GU3s78xL8bYh6xWQ6xZTbu48rG49TE
ENV INTERNAL_API_SECRET=local-dev-only-K4cSj9SNn7wHvpa86LkDe3br9v9j5C3p
ENV GITHUB_CLIENT_ID=replace-me-github-client-id
ENV GITHUB_CLIENT_SECRET=replace-me-github-client-secret
ENV GOOGLE_CLIENT_ID=replace-me-google-client-id
ENV GOOGLE_CLIENT_SECRET=replace-me-google-client-secret
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG CONSOLE_API_INTERNAL_ORIGIN=http://api:4000
ARG NEXT_PUBLIC_AUTH_ORIGIN=http://localhost:4000
ARG NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS=
ARG NEXT_PUBLIC_APP_URL=http://localhost:3001
ARG NEXT_PUBLIC_ADMIN_URL=http://localhost:3003
ARG NEXT_PUBLIC_MARKETING_URL=http://localhost:3000
ARG NEXT_PUBLIC_DOCS_URL=http://localhost:3002
ARG NEXT_PUBLIC_CONSOLE_API_PATH=/api/v1/console
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV CONSOLE_API_INTERNAL_ORIGIN=$CONSOLE_API_INTERNAL_ORIGIN
ENV NEXT_PUBLIC_AUTH_ORIGIN=$NEXT_PUBLIC_AUTH_ORIGIN
ENV NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS=$NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_MARKETING_URL=$NEXT_PUBLIC_MARKETING_URL
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL
ENV NEXT_PUBLIC_CONSOLE_API_PATH=$NEXT_PUBLIC_CONSOLE_API_PATH
RUN pnpm --filter console build

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/console/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/console/.next/static ./apps/console/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/console/public ./apps/console/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/console/server.js"]
