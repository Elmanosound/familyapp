#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# FamilyApp — Script d'installation NAS (Zorin OS 18 / Ubuntu 22.04)
#
# Usage :
#   git clone https://github.com/Elmanosound/familyapp /opt/familyapp
#   cd /opt/familyapp
#   cp .env.nas.example .env && nano .env   # remplir les secrets
#   sudo bash scripts/install-nas.sh
#
# Ce script peut être relancé en toute sécurité pour mettre à jour l'application.
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()   { echo -e "${GREEN}  [✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}  [!]${NC} $*"; }
error() { echo -e "${RED}  [✗]${NC} $*"; exit 1; }
step()  { echo -e "\n${BLUE}${BOLD}──▶${NC}${BOLD} $*${NC}"; }
banner(){ echo -e "\n${BLUE}${BOLD}$*${NC}"; }

# ── Chemins ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_FILE="/etc/systemd/system/familyapp.service"

# ── Vérifications préliminaires ───────────────────────────────────────────────
banner "═══════════════════════════════════════════"
banner "   FamilyApp — Installation NAS"
banner "═══════════════════════════════════════════"

if [[ $EUID -ne 0 ]]; then
  error "Ce script doit être lancé en tant que root.\n  → sudo bash scripts/install-nas.sh"
fi

# Utilisateur propriétaire des fichiers (celui qui a lancé sudo)
APP_USER="${SUDO_USER:-$(logname 2>/dev/null || echo "$USER")}"
if [[ "$APP_USER" == "root" ]]; then
  warn "Impossible de détecter l'utilisateur courant ; les fichiers appartiendront à root."
fi
log "Utilisateur applicatif : $APP_USER"
log "Répertoire d'installation : $INSTALL_DIR"

# ── 1. Fichier .env ────────────────────────────────────────────────────────────
step "1/7 — Vérification du fichier .env"

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  if [[ -f "$INSTALL_DIR/.env.nas.example" ]]; then
    cp "$INSTALL_DIR/.env.nas.example" "$INSTALL_DIR/.env"
    chown "$APP_USER:$APP_USER" "$INSTALL_DIR/.env"
    warn "Fichier .env créé depuis .env.nas.example"
    warn "Éditez $INSTALL_DIR/.env (remplissez les CHANGE_ME) puis relancez ce script."
    exit 0
  else
    error ".env introuvable. Créez $INSTALL_DIR/.env en vous basant sur .env.nas.example"
  fi
fi

# Vérifier que les secrets ont bien été définis
if grep -qE "CHANGE_ME" "$INSTALL_DIR/.env"; then
  error "Le fichier .env contient encore des valeurs CHANGE_ME.\n  → Éditez $INSTALL_DIR/.env avant de continuer."
fi
log ".env valide"

# ── 2. Node.js 20 ─────────────────────────────────────────────────────────────
step "2/7 — Node.js 20"

install_node() {
  warn "Installation de Node.js 20 via NodeSource…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
}

if command -v node &>/dev/null; then
  NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_MAJOR" -lt 20 ]]; then
    warn "Node.js $NODE_MAJOR détecté — mise à jour vers Node.js 20 requise"
    install_node
  else
    log "Node.js $(node --version) ✓"
  fi
else
  install_node
fi

# ── 3. PostgreSQL ──────────────────────────────────────────────────────────────
step "3/7 — PostgreSQL"

if ! command -v psql &>/dev/null; then
  warn "PostgreSQL non trouvé — installation…"
  apt-get install -y postgresql postgresql-contrib
fi

systemctl start postgresql
systemctl enable postgresql
log "PostgreSQL $(psql --version | awk '{print $3}') ✓"

# Extraire les identifiants depuis DATABASE_URL
# Format : postgresql://USER:PASS@HOST:PORT/DBNAME
DB_URL=$(grep "^DATABASE_URL=" "$INSTALL_DIR/.env" | cut -d= -f2-)
DB_USER=$(echo "$DB_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+)(\?.*)?$|\1|')

# Créer le rôle PostgreSQL s'il n'existe pas
if ! su -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\"" postgres | grep -q 1; then
  su -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS'\"" postgres
  log "Rôle PostgreSQL '$DB_USER' créé"
else
  # Mettre à jour le mot de passe si l'utilisateur existe déjà
  su -c "psql -c \"ALTER USER $DB_USER WITH PASSWORD '$DB_PASS'\"" postgres
  log "Rôle PostgreSQL '$DB_USER' existant — mot de passe mis à jour"
fi

# Créer la base si elle n'existe pas
if ! su -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" postgres | grep -q 1; then
  su -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER\"" postgres
  log "Base de données '$DB_NAME' créée"
else
  log "Base de données '$DB_NAME' existante ✓"
fi

# ── 4. Dépendances & build ─────────────────────────────────────────────────────
step "4/7 — Installation des dépendances et build"

cd "$INSTALL_DIR"
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build
log "Build server + client terminé"

# ── 5. Migrations Prisma ───────────────────────────────────────────────────────
step "5/7 — Migrations de la base de données"

cd "$INSTALL_DIR"
sudo -u "$APP_USER" env "$(grep -v '^#' .env | xargs)" npx prisma migrate deploy --schema=server/prisma/schema.prisma
log "Migrations appliquées"

# ── 6. Service systemd ─────────────────────────────────────────────────────────
step "6/7 — Service systemd"

sed \
  -e "s|INSTALL_DIR|$INSTALL_DIR|g" \
  -e "s|FAMILYAPP_USER|$APP_USER|g" \
  "$SCRIPT_DIR/familyapp.service" > "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable familyapp

if systemctl is-active --quiet familyapp; then
  systemctl restart familyapp
  log "Service familyapp redémarré"
else
  systemctl start familyapp
  log "Service familyapp démarré"
fi

# Attendre que le service soit healthy
for i in {1..15}; do
  if curl -sf "http://localhost:$(grep '^PORT=' "$INSTALL_DIR/.env" | cut -d= -f2 || echo 5000)/health" &>/dev/null; then
    log "Backend répond sur le port ✓"
    break
  fi
  sleep 1
done

# ── 7. Application Electron desktop ───────────────────────────────────────────
step "7/7 — Build et installation de l'application desktop"

# Convertir l'icône SVG en PNG si ImageMagick est disponible
SVG="$INSTALL_DIR/electron/icons/icon.svg"
ICON_512="$INSTALL_DIR/electron/icons/icon.png"
ICON_22="$INSTALL_DIR/electron/icons/tray.png"

if [[ -f "$SVG" && ! -f "$ICON_512" ]]; then
  if command -v convert &>/dev/null; then
    convert -background none -resize 512x512 "$SVG" "$ICON_512"
    convert -background none -resize 22x22   "$SVG" "$ICON_22"
    chown "$APP_USER:$APP_USER" "$ICON_512" "$ICON_22"
    log "Icônes générées depuis icon.svg"
  elif command -v inkscape &>/dev/null; then
    inkscape --export-type=png --export-width=512 --export-filename="$ICON_512" "$SVG" 2>/dev/null
    inkscape --export-type=png --export-width=22  --export-filename="$ICON_22"  "$SVG" 2>/dev/null
    chown "$APP_USER:$APP_USER" "$ICON_512" "$ICON_22"
    log "Icônes générées via Inkscape"
  else
    warn "ImageMagick ou Inkscape non trouvé — icônes par défaut utilisées"
    warn "Installez avec : sudo apt install imagemagick"
  fi
fi

# Build Electron
cd "$INSTALL_DIR"
sudo -u "$APP_USER" npm run electron:build:linux

# Installer le .deb s'il existe, sinon lancer depuis AppImage
DEB=$(ls "$INSTALL_DIR/dist-electron/"*.deb 2>/dev/null | head -1 || true)

if [[ -n "$DEB" ]]; then
  apt-get install -y "$DEB" 2>/dev/null || dpkg -i "$DEB" && apt-get install -f -y
  log "FamilyApp installé (.deb) — cherchez-le dans le lanceur Zorin"
else
  APPIMAGE=$(ls "$INSTALL_DIR/dist-electron/"*.AppImage 2>/dev/null | head -1 || true)
  if [[ -n "$APPIMAGE" ]]; then
    chmod +x "$APPIMAGE"
    chown "$APP_USER:$APP_USER" "$APPIMAGE"

    # Créer une entrée .desktop pour le lanceur Zorin
    DESKTOP_DIR="/home/$APP_USER/.local/share/applications"
    mkdir -p "$DESKTOP_DIR"
    cat > "$DESKTOP_DIR/familyapp.desktop" <<EOF
[Desktop Entry]
Name=FamilyApp
GenericName=Application familiale
Comment=Organisez votre famille au quotidien
Exec=$APPIMAGE --no-sandbox
Icon=$INSTALL_DIR/electron/icons/icon.png
Terminal=false
Type=Application
Categories=Network;
StartupWMClass=familyapp
EOF
    chown "$APP_USER:$APP_USER" "$DESKTOP_DIR/familyapp.desktop"
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
    log "FamilyApp AppImage installé avec entrée dans le lanceur Zorin"
  else
    warn "Aucun package trouvé dans dist-electron/"
    warn "Vérifiez la sortie du build Electron ci-dessus."
  fi
fi

# ── Résumé ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   FamilyApp installé avec succès ! 🎉${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}App desktop :${NC}   Cherchez « FamilyApp » dans le lanceur Zorin"
echo -e "  ${BOLD}Interface web :${NC}  http://localhost:$(grep '^PORT=' "$INSTALL_DIR/.env" | cut -d= -f2 || echo 5000)"
echo ""
echo -e "  ${BOLD}Commandes utiles :${NC}"
echo -e "    sudo systemctl status  familyapp   # état du service"
echo -e "    sudo systemctl restart familyapp   # redémarrer"
echo -e "    sudo journalctl -u familyapp -f    # logs en direct"
echo ""
echo -e "  ${BOLD}Mise à jour :${NC}"
echo -e "    cd $INSTALL_DIR && git pull && sudo bash scripts/install-nas.sh"
echo ""
