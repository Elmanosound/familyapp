#!/bin/sh
# ============================================================
#  deploy.sh — Pull the latest pre-built image and restart
#
#  The image is compiled by GitHub Actions and pushed to ghcr.io.
#  This script only pulls and restarts — takes ~30 seconds.
#
#  Usage:
#    chmod +x deploy.sh     # first time only
#    ./deploy.sh
#
#  HTTPS mode is activated automatically when DOMAIN is set in .env.
#  Make sure .env also contains:
#    DOMAIN=family.example.com
#    CLIENT_URL=https://family.example.com
#    APP_PORT=127.0.0.1:8080
# ============================================================

set -e

# Load .env to detect DOMAIN (if present)
# set -a auto-exports every variable defined while the file is sourced;
# this handles special characters in secrets (base64, slashes, etc.)
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi

# Choose profile based on whether DOMAIN is configured
if [ -n "${DOMAIN}" ]; then
  COMPOSE_PROFILES="https"
  echo "==> HTTPS mode  (DOMAIN=${DOMAIN})"
else
  COMPOSE_PROFILES=""
  echo "==> HTTP mode  (set DOMAIN in .env to enable HTTPS)"
fi

echo "==> Pulling latest image from ghcr.io..."
COMPOSE_PROFILES="${COMPOSE_PROFILES}" docker compose pull app caddy 2>/dev/null || \
COMPOSE_PROFILES="${COMPOSE_PROFILES}" docker compose pull app

echo "==> Restarting containers..."
COMPOSE_PROFILES="${COMPOSE_PROFILES}" docker compose up -d --no-build

echo "==> Cleaning up old images..."
docker image prune -f

echo ""
if [ -n "${DOMAIN}" ]; then
  echo "==> Done. App running at https://${DOMAIN}"
  echo "    (Certificate will be issued by Let's Encrypt on first request)"
else
  echo "==> Done. App running at http://$(hostname -I | awk '{print $1}'):${APP_PORT:-8080}"
fi

COMPOSE_PROFILES="${COMPOSE_PROFILES}" docker compose ps
