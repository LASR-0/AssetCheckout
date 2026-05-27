# syntax=docker.io/docker/dockerfile:1
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++

# ── deps: install all workspace deps ────────────────────────────────────────
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ── build: generate Prisma client, build frontend, compile backend ───────────
FROM deps AS build
COPY backend ./backend
COPY frontend ./frontend
RUN pnpm --filter @asset-checkout/backend exec prisma generate
RUN pnpm --filter @asset-checkout/frontend run build
RUN pnpm --filter @asset-checkout/backend exec tsc
# Bundle prod-only deps into /deploy, then add compiled/generated artifacts
RUN pnpm --filter @asset-checkout/backend --prod deploy --legacy /deploy
RUN cp -r backend/dist /deploy/dist \
 && cp -r backend/generated /deploy/generated \
 && cp -r backend/prisma /deploy/prisma \
 && cp -r frontend/dist /deploy/frontend

# ── runner: lean production image ───────────────────────────────────────────
FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 appuser

COPY --from=build --chown=appuser:nodejs /deploy ./

USER appuser
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Migrate DB on startup (idempotent), then start server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/server.js"]
