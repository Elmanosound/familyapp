#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# FamilyApp — Script de mise à jour NAS
#
# Usage manuel :
#   sudo bash scripts/update-nas.sh
#
# Mise à jour automatique (ajouter au crontab avec : sudo crontab -e) :
#   0 3 * * 1  /opt/familyapp/familyapp/scripts/update-nas.sh >> /dev/null 2>&1
#   └─ Tous les lundis à 03h00
#
# Ce script :
#   1. Vérifie s'il y a de nouveaux commits sur origin/main
#   2. Sauvegarde les builds actuels
#   3. git pull + npm install + build + migrations + restart
#   4. Vérifie que le service répond (/health)
#   5. En cas d'échec : rollback automatique vers la version précédente
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Chemins ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$INSTALL_DIR/.update-backup"
LOG_DIR="$INSTALL_DIR/logs"
LOG_FILE="$LOG_DIR/update.log"
SERVICE_NAME="familyapp"

# ── Helpers ───────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

ts()    { date '+%Y-%m-%d %H:%M:%S'; }
log()   { echo "[$(ts)]  $*" | tee -a "$LOG_FILE"; }
ok()    { echo "[$(ts)] ✓ $*" | tee -a "$LOG_FILE"; }
warn()  { echo "[$(ts)] ⚠ $*" | tee -a "$LOG_FILE"; }
error() { echo "[$(ts)] ✗ $*" | tee -a "$LOG_FILE"; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en tant que root : sudo bash scripts/update-nas.sh"
  exit 1
fi

APP_USER=$(stat -c '%U' "$INSTALL_DIR")
PORT=$(grep '^PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo 5000)

log "════════════════════════════════════════"
log " FamilyApp — Mise à jour NAS"
log "════════════════════════════════════════"

# ── 1. Vérifier s'il y a de nouveaux commits ──────────────────────────────────
cd "$INSTALL_DIR"

BEFORE_COMMIT=$(git rev-parse HEAD)
log "Version actuelle : $BEFORE_COMMIT"

git fetch origin main --quiet
LATEST_COMMIT=$(git rev-parse origin/main)

if [[ "$BEFORE_COMMIT" == "$LATEST_COMMIT" ]]; then
  ok "Déjà à jour — aucune action nécessaire."
  exit 0
fi

log "Mise à jour disponible : $BEFORE_COMMIT → $LATEST_COMMIT"
COMMIT_MSG=$(git log --oneline "$BEFORE_COMMIT..$LATEST_COMMIT" | head -5)
log "Commits inclus :"
echo "$COMMIT_MSG" | while IFS= read -r line; do log "  $line"; done

# ── 2. Sauvegarder les builds actuels ─────────────────────────────────────────
log "Sauvegarde de la version actuelle…"
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

[[ -d "$INSTALL_DIR/server/dist" ]] && cp -r "$INSTALL_DIR/server/dist" "$BACKUP_DIR/server-dist"
[[ -d "$INSTALL_DIR/client/dist" ]] && cp -r "$INSTALL_DIR/client/dist" "$BACKUP_DIR/client-dist"
ok "Backup créé dans $BACKUP_DIR"

# ── Rollback ──────────────────────────────────────────────────────────────────
rollback() {
  warn "Échec détecté — rollback vers $BEFORE_COMMIT…"
  git checkout "$BEFORE_COMMIT" --quiet 2>/dev/null || true

  if [[ -d "$BACKUP_DIR/server-dist" ]]; then
    rm -rf "$INSTALL_DIR/server/dist"
    cp -r "$BACKUP_DIR/server-dist" "$INSTALL_DIR/server/dist"
  fi
  if [[ -d "$BACKUP_DIR/client-dist" ]]; then
    rm -rf "$INSTALL_DIR/client/dist"
    cp -r "$BACKUP_DIR/client-dist" "$INSTALL_DIR/client/dist"
  fi

  systemctl restart "$SERVICE_NAME" 2>/dev/null || true

  # Attendre que le service soit de nouveau opérationnel
  for i in {1..10}; do
    if curl -sf "http://localhost:$PORT/health" &>/dev/null; then
      ok "Service restauré sur la version précédente ($BEFORE_COMMIT)"
      break
    fi
    sleep 1
  done

  warn "Consultez les logs : sudo journalctl -u $SERVICE_NAME -n 50"
  warn "Log de mise à jour : $LOG_FILE"
  exit 1
}

trap rollback ERR

# ── 3. git pull ───────────────────────────────────────────────────────────────
log "Téléchargement des modifications…"
sudo -u "$APP_USER" git pull origin main --quiet
ok "Code mis à jour"

# ── 4. Dépendances ────────────────────────────────────────────────────────────
log "Mise à jour des dépendances npm…"
sudo -u "$APP_USER" npm install --prefer-offline --silent
ok "Dépendances à jour"

# ── 5. Build ──────────────────────────────────────────────────────────────────
log "Build server + client…"
sudo -u "$APP_USER" npm run build --silent
ok "Build terminé"

# ── 6. Migrations Prisma ──────────────────────────────────────────────────────
log "Application des migrations de base de données…"
ENV_VARS=$(grep -v '^\s*#' "$INSTALL_DIR/.env" | grep -v '^\s*$' | xargs)
sudo -u "$APP_USER" env $ENV_VARS \
  npx prisma migrate deploy --schema=server/prisma/schema.prisma
ok "Migrations appliquées"

# ── 7. Redémarrage du service ─────────────────────────────────────────────────
log "Redémarrage du service $SERVICE_NAME…"
systemctl restart "$SERVICE_NAME"

# ── 8. Health check ───────────────────────────────────────────────────────────
log "Vérification du service…"
HEALTHY=false
for i in {1..15}; do
  if curl -sf "http://localhost:$PORT/health" &>/dev/null; then
    HEALTHY=true
    break
  fi
  sleep 1
done

if [[ "$HEALTHY" != "true" ]]; then
  error "Le service ne répond pas sur le port $PORT après redémarrage"
fi

# ── Succès ────────────────────────────────────────────────────────────────────
trap - ERR
rm -rf "$BACKUP_DIR"

ok "════════════════════════════════════════"
ok " Mise à jour réussie !"
ok " Version : $BEFORE_COMMIT → $LATEST_COMMIT"
ok " Service : http://localhost:$PORT"
ok "════════════════════════════════════════"

# Garder seulement les 500 dernières lignes de log
tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
