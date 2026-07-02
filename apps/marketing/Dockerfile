FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/marketing/package.json apps/marketing/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
COPY packages/env/package.json packages/env/
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter marketing...

FROM base AS build
WORKDIR /app
COPY --from=deps /app ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://planisfy:planisfy@postgres:5432/planisfy
ENV BETTER_AUTH_SECRET=local-dev-only-q1GU3s78xL8bYh6xWQ6xZTbu48rG49TE
ENV GITHUB_CLIENT_ID=replace-me-github-client-id
ENV GITHUB_CLIENT_SECRET=replace-me-github-client-secret
ENV GOOGLE_CLIENT_ID=replace-me-google-client-id
ENV GOOGLE_CLIENT_SECRET=replace-me-google-client-secret
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_AUTH_ORIGIN=http://localhost:3000
ARG NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS=
ARG NEXT_PUBLIC_CONSOLE_URL=http://localhost:3001
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_MARKETING_URL
ARG NEXT_PUBLIC_CONTACT_EMAIL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_ORIGIN=$NEXT_PUBLIC_AUTH_ORIGIN
ENV NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS=$NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS
ENV NEXT_PUBLIC_CONSOLE_URL=$NEXT_PUBLIC_CONSOLE_URL
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL
ENV NEXT_PUBLIC_MARKETING_URL=$NEXT_PUBLIC_MARKETING_URL
ENV NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL
RUN pnpm --filter marketing build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/marketing/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/marketing/.next/static ./apps/marketing/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/marketing/public ./apps/marketing/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/marketing/server.js"]
