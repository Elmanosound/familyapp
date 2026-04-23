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
if [ -f .env ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
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
