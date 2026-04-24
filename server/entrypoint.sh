#!/bin/sh
# ============================================================
#  entrypoint.sh — Migration-aware startup script
#
#  Handles three database states automatically:
#
#  1. Fresh database (no tables yet)
#     prisma migrate deploy runs the init SQL and creates all tables.
#
#  2. Legacy database (tables exist but no _prisma_migrations table —
#     previously managed with `prisma db push`)
#     The init migration is baselined (marked as applied without running
#     its SQL) so Prisma takes over without touching existing data.
#     Future schema changes go through proper migrations.
#
#  3. Already-migrated database
#     prisma migrate deploy is a no-op if up to date, or applies
#     any pending migrations added since last deployment.
# ============================================================
set -e

# ── Find the initial migration name ──────────────────────────
INIT_MIGRATION=""
if [ -d prisma/migrations ]; then
  INIT_MIGRATION=$(ls prisma/migrations | grep -v README | grep -v migration_lock | head -1)
fi

# ── Detect database state ─────────────────────────────────────
# Probe the users table. Success → legacy/already-migrated DB.
# Failure (table doesn't exist) → fresh DB.
echo "[entrypoint] Detecting database state..."
DB_STATE=$(node --input-type=commonjs -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.user.count()
  .then(() => {
    process.stdout.write("legacy\n");
    p.$disconnect().finally(() => process.exit(0));
  })
  .catch(() => {
    process.stdout.write("fresh\n");
    p.$disconnect().catch(() => {}).finally(() => process.exit(0));
  });
' 2>/dev/null)

DB_STATE="${DB_STATE:-fresh}"
echo "[entrypoint] Database state: ${DB_STATE}"

# ── Baseline legacy database ──────────────────────────────────
# Mark the init migration as already applied so migrate deploy
# becomes a no-op on the existing schema.
# This command errors if the migration is already recorded — that's
# fine, we swallow the error and let migrate deploy handle the rest.
if [ "$DB_STATE" = "legacy" ] && [ -n "$INIT_MIGRATION" ]; then
  echo "[entrypoint] Baselining migration '${INIT_MIGRATION}'..."
  npx prisma migrate resolve --applied "$INIT_MIGRATION" 2>&1 || true
fi

# ── Apply pending migrations ──────────────────────────────────
echo "[entrypoint] Applying pending migrations..."
npx prisma migrate deploy
echo "[entrypoint] Migrations OK."

# ── Start server ──────────────────────────────────────────────
echo "[entrypoint] Starting server..."
exec node dist/index.js
