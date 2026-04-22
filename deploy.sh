#!/bin/sh
# ============================================================
#  deploy.sh — Pull the latest pre-built image and restart
#
#  Run this on the GCP VM instead of "docker compose up --build".
#  The image is already compiled by GitHub Actions; this script
#  only pulls and restarts — takes ~30 seconds.
#
#  Usage:
#    chmod +x deploy.sh          # first time only
#    ./deploy.sh
# ============================================================

set -e

echo "==> Pulling latest image from ghcr.io..."
docker compose pull app

echo "==> Restarting containers..."
docker compose up -d --no-build

echo "==> Cleaning up old images..."
docker image prune -f

echo "==> Done. App running at http://localhost:8080"
docker compose ps
