#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# FamilyApp — Script de sauvegarde NAS
#
# Usage manuel :
#   sudo bash scripts/backup-nas.sh
#
# Déclenché automatiquement tous les jours à 03:00 par le systemd timer
# "familyapp-backup.timer" (installé par install-nas.sh).
#
# Contenu d'une sauvegarde (backup-YYYY-MM-DD_HH-MM-SS.tar.gz) :
#   ├── manifest.txt      — horodatage, hostname, commit git
#   ├── database.dump     — dump PostgreSQL (format custom, restauration sélective)
#   └── uploads.tar.gz    — archive des photos / médias / pièces jointes
#
# Rotation : les sauvegardes de plus de BACKUP_RETENTION_DAYS jours (défaut : 7)
#            sont supprimées automatiquement.
#
# Emplacement des sauvegardes : $INSTALL_DIR/backups/
#   → Personnalisable via BACKUP_DIR dans .env
#   → Pointez vers un volume NAS dédié pour une vraie résilience :
#     BACKUP_DIR=/mnt/nas-backup/familyapp
#
# ── Restauration ─────────────────────────────────────────────────────────────
#
#   # 1. Extraire l'archive
#   tar xzf backup-YYYY-MM-DD_HH-MM-SS.tar.gz -C /tmp/restore/
#
#   # 2. Restaurer la base PostgreSQL
#   PGPASSWORD=<mot de passe> pg_restore \
#     --host=localhost --username=familyapp \
#     --dbname=familyapp --clean --if-exists \
#     /tmp/restore/database.dump
#
#   # 3. Restaurer les uploads
#   tar xzf /tmp/restore/uploads.tar.gz -C /opt/familyapp/server/
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()   { echo -e "${GREEN}  [✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}  [!]${NC} $*"; }
error() { echo -e "${RED}  [✗]${NC} $*" >&2; exit 1; }
step()  { echo -e "\n${BLUE}${BOLD}──▶${NC}${BOLD} $*${NC}"; }

# ── Chemins ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"

# ── Charger le fichier .env ───────────────────────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
[[ -f "$ENV_FILE" ]] || error "Fichier .env introuvable : $ENV_FILE"

# Chargement sécurisé : ignore les commentaires et lignes vides,
# gère les valeurs contenant des espaces ou des caractères spéciaux.
set -a
# shellcheck disable=SC1090
source <(grep -vE "^\s*#|^\s*$" "$ENV_FILE" | sed 's/\r//')
set +a

# ── Configuration ─────────────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="${BACKUP_DIR:-$INSTALL_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
LOG_DIR="$INSTALL_DIR/logs"
LOG_FILE="$LOG_DIR/backup.log"
LOG_MAX_LINES=1000

# Uploads : UPLOADS_DIR du .env s'il est défini, sinon chemin par défaut
UPLOADS_SRC="${UPLOADS_DIR:-$INSTALL_DIR/server/uploads}"

# ── Vérifications préliminaires ───────────────────────────────────────────────
command -v pg_dump &>/dev/null || error "pg_dump introuvable. Installez postgresql-client."
[[ -n "${DATABASE_URL:-}" ]] || error "DATABASE_URL non défini dans .env"

# Extraire les identifiants depuis DATABASE_URL
# Format attendu : postgresql://USER:PASS@HOST:PORT/DBNAME
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+)[:/].*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/[^/]+$|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+)(\?.*)?$|\1|')

# ── Initialisation des répertoires ────────────────────────────────────────────
mkdir -p "$BACKUP_DIR" "$LOG_DIR"
chmod 750 "$BACKUP_DIR"   # sauvegardes accessibles root uniquement

# Rediriger stdout+stderr vers le log tout en gardant la sortie console
exec > >(tee -a "$LOG_FILE") 2>&1

echo ""
echo "════════════════════════════════════════════"
echo "  FamilyApp — Sauvegarde $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════"

# ── Répertoire de travail temporaire ─────────────────────────────────────────
WORK_DIR=$(mktemp -d)
# Nettoyage automatique du répertoire temporaire quoi qu'il arrive
trap 'rm -rf "$WORK_DIR"' EXIT

# ── 1. Dump PostgreSQL ────────────────────────────────────────────────────────
step "1/3 — Dump PostgreSQL ($DB_NAME @ $DB_HOST:$DB_PORT)"

DB_DUMP="$WORK_DIR/database.dump"

PGPASSWORD="$DB_PASS" pg_dump \
  --host="$DB_HOST"     \
  --port="$DB_PORT"     \
  --username="$DB_USER" \
  --format=custom       \
  --no-password         \
  --file="$DB_DUMP"     \
  "$DB_NAME"

DB_SIZE=$(du -sh "$DB_DUMP" | cut -f1)
log "Dump PostgreSQL OK — $DB_SIZE"

# ── 2. Archive des uploads ────────────────────────────────────────────────────
step "2/3 — Archive des uploads ($UPLOADS_SRC)"

UPLOADS_ARCHIVE="$WORK_DIR/uploads.tar.gz"

if [[ -d "$UPLOADS_SRC" ]]; then
  UPLOADS_COUNT=$(find "$UPLOADS_SRC" -type f 2>/dev/null | wc -l)
  tar czf "$UPLOADS_ARCHIVE" \
    -C "$(dirname "$UPLOADS_SRC")" \
    "$(basename "$UPLOADS_SRC")"
  UPLOADS_SIZE=$(du -sh "$UPLOADS_ARCHIVE" | cut -f1)
  log "Archive uploads OK — $UPLOADS_COUNT fichier(s) — $UPLOADS_SIZE"
else
  warn "Dossier uploads introuvable ($UPLOADS_SRC) — archive vide incluse"
  # Créer une archive vide valide
  tar czf "$UPLOADS_ARCHIVE" -T /dev/null
fi

# ── 3. Empaquetage final + rotation ──────────────────────────────────────────
step "3/3 — Empaquetage final et rotation ($RETENTION_DAYS jours)"

# Manifest : pour retrouver facilement quel commit/date correspond à une archive
cat > "$WORK_DIR/manifest.txt" <<MANIFEST
FamilyApp Backup
================
Date       : $(date -u '+%Y-%m-%dT%H:%M:%SZ')
Hostname   : $(hostname)
Git commit : $(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
Database   : $DB_NAME @ $DB_HOST:$DB_PORT
Uploads    : $UPLOADS_SRC
Retention  : $RETENTION_DAYS jours
MANIFEST

# Empaqueter manifest + dump + uploads en une seule archive
BACKUP_FILE="$BACKUP_DIR/backup-$TIMESTAMP.tar.gz"
tar czf "$BACKUP_FILE" -C "$WORK_DIR" manifest.txt database.dump uploads.tar.gz

TOTAL_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
log "Archive créée : $(basename "$BACKUP_FILE") — $TOTAL_SIZE"

# Rotation : supprimer les sauvegardes plus anciennes que RETENTION_DAYS
DELETED_LIST=$(find "$BACKUP_DIR" -maxdepth 1 -name "backup-*.tar.gz" -mtime +"$RETENTION_DAYS" -print)
if [[ -n "$DELETED_LIST" ]]; then
  DELETED_COUNT=$(echo "$DELETED_LIST" | wc -l)
  echo "$DELETED_LIST" | xargs rm -f
  log "Rotation : $DELETED_COUNT sauvegarde(s) supprimée(s) (> $RETENTION_DAYS jours)"
fi

# Bilan des sauvegardes conservées
KEPT=$(find "$BACKUP_DIR" -maxdepth 1 -name "backup-*.tar.gz" | sort)
KEPT_COUNT=$(echo "$KEPT" | grep -c "backup-" || true)
log "$KEPT_COUNT sauvegarde(s) conservée(s) :"
echo "$KEPT" | while read -r f; do
  [[ -z "$f" ]] && continue
  echo "    $(du -sh "$f" | cut -f1)  $(basename "$f")"
done

# Rotation du log (garder les N dernières lignes)
if [[ -f "$LOG_FILE" ]]; then
  LINES=$(wc -l < "$LOG_FILE")
  if [[ "$LINES" -gt "$LOG_MAX_LINES" ]]; then
    tail -n "$LOG_MAX_LINES" "$LOG_FILE" > "${LOG_FILE}.tmp" \
      && mv "${LOG_FILE}.tmp" "$LOG_FILE"
  fi
fi

echo ""
log "Sauvegarde terminée — $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════"
echo ""
