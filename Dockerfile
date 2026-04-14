# syntax=docker/dockerfile:1.7

# ============================================================
#  FamilyApp — Multi-stage Dockerfile
#  Builds shared types, server (Express), and client (Vite)
#  Runtime: a single Node.js process serving the API + the
#  static React client + uploaded files.
#
#  Build:    docker build -t familyapp .
#  Run:      docker run -p 8080:8080 \
#              -e DATABASE_URL=postgresql://... \
#              -e JWT_SECRET=... \
#              familyapp
# ============================================================

# ─── Stage 1: dependencies ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy manifests for monorepo workspaces
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all workspaces deps (including devDependencies — needed for build)
RUN npm ci --workspaces --include-workspace-root


# ─── Stage 2: build ────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/shared/node_modules ./shared/node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules
COPY . .

# Build order: shared → server (with prisma generate) → client
RUN npm run build -w shared
RUN npm run build -w server
RUN npm run build -w client


# ─── Stage 3: production runtime ────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# OpenSSL is needed by Prisma on Alpine
RUN apk add --no-cache openssl tini

# Copy only the production bits we need
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/

# Install production dependencies only
RUN npm ci --workspaces --include-workspace-root --omit=dev \
 && npm cache clean --force

# Copy compiled artifacts from the build stage
COPY --from=build /app/shared/src ./shared/src
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=build /app/server/node_modules/@prisma ./server/node_modules/@prisma
COPY --from=build /app/client/dist ./client

# Persistent uploads directory
RUN mkdir -p /app/server/uploads
VOLUME ["/app/server/uploads"]

WORKDIR /app/server
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# tini gives us proper signal handling (PID 1)
ENTRYPOINT ["/sbin/tini", "--"]
# Apply pending Prisma migrations (or create the schema on first boot) then start
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
