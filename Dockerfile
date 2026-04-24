# syntax=docker/dockerfile:1.7

# ============================================================
#  FamilyApp — Multi-stage Dockerfile
#
#  Builds the shared types, the Express server, and the React
#  client into a single Node.js runtime image that also serves
#  the static SPA from /app/client.
#
#  Build:    docker build -t familyapp .
#  Compose:  docker compose up -d --build
# ============================================================

# ─── Stage 1: base image shared by every stage ──────────────
FROM node:20-alpine AS base
WORKDIR /app
# OpenSSL for Prisma engine, tini for proper PID 1 signal handling,
# wget for the container healthcheck.
RUN apk add --no-cache openssl tini wget


# ─── Stage 2: install all workspace dependencies ────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
# npm workspaces hoist most deps to /app/node_modules — we only need
# that single directory to reach every package. Including dev deps
# because the build stage compiles TypeScript and runs Vite.
# --mount=type=cache keeps the npm registry cache between CI runs so
# subsequent builds skip downloading unchanged packages entirely.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspaces --include-workspace-root


# ─── Stage 3: build shared → server → client ────────────────
FROM deps AS build
COPY . .
# Build in dependency order. `npm run build -w server` runs
# `prisma generate` first, which writes /app/node_modules/.prisma
RUN npm run build -w shared \
 && npm run build -w server \
 && npm run build -w client


# ─── Stage 4: production runtime ────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=8080

# We copy the full (hoisted) node_modules from the build stage.
# This includes the generated Prisma client (/app/node_modules/.prisma)
# and the prisma CLI used at startup for `prisma db push`.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json

# Shared workspace (source re-exported as package main)
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/src ./shared/src

# Compiled server + Prisma schema
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma

# Built static client — Express serves this in production
COPY --from=build /app/client/dist ./client

# Uploads survive container restarts via a docker volume
RUN mkdir -p /app/server/uploads
VOLUME ["/app/server/uploads"]

WORKDIR /app/server

# Migration-aware entrypoint: detects legacy (db-push) vs fresh databases,
# baselines if needed, then runs `prisma migrate deploy` before starting.
COPY server/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.sh"]
