#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  ACLS Website – Automatisches Server-Setup
#  Einmal ausführen: bash setup.sh
# ═══════════════════════════════════════════════════════════════

set -e  # Script stoppt bei jedem Fehler

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        ACLS Website – Server Setup           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Root prüfen ────────────────────────────────────────────────
[ "$EUID" -ne 0 ] && err "Bitte als root ausführen: sudo bash setup.sh"

# ── Eingaben sammeln ───────────────────────────────────────────
echo -e "${YELLOW}Bitte folgende Werte eingeben:${NC}"
echo ""

read -p "  Domain (z.B. meine-seite.de, OHNE www): " DOMAIN
read -p "  Discord Client ID:                       " DISCORD_CLIENT_ID
read -p "  Discord Client Secret:                   " DISCORD_CLIENT_SECRET
read -p "  Discord Bot Token:                       " DISCORD_BOT_TOKEN
read -p "  Discord Guild ID:                        " DISCORD_GUILD_ID
read -p "  Deine Discord ID (für Admin-Account):   " ADMIN_DISCORD_ID
read -p "  Dein Discord Name (für Admin-Account):  " ADMIN_USERNAME
read -p "  IC-Kanal Keywords (Standard: IC,Dienst): " IC_KEYWORDS
IC_KEYWORDS=${IC_KEYWORDS:-"IC,Dienst,Fahrstunde,Prüfung,Service,Einsatz"}

# Zufällige Secrets generieren
SESSION_SECRET=$(openssl rand -hex 32)
BOT_API_SECRET=$(openssl rand -hex 24)
INSTALL_DIR="/var/www/acls"

echo ""
info "Starte Installation..."
echo ""

# ── System aktualisieren ───────────────────────────────────────
info "System wird aktualisiert..."
apt-get update -qq && apt-get upgrade -y -qq
log "System aktualisiert"

# ── Node.js 20 installieren ────────────────────────────────────
info "Node.js 20 wird installiert..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
apt-get install -y nodejs -qq
log "Node.js $(node -v) installiert"

# ── Nginx installieren ─────────────────────────────────────────
info "Nginx wird installiert..."
apt-get install -y nginx -qq
systemctl enable nginx > /dev/null
systemctl start nginx
log "Nginx installiert"

# ── Certbot installieren ───────────────────────────────────────
info "Certbot (SSL) wird installiert..."
apt-get install -y certbot python3-certbot-nginx -qq
log "Certbot installiert"

# ── PM2 installieren ───────────────────────────────────────────
info "PM2 (Prozess-Manager) wird installiert..."
npm install -g pm2 --silent
log "PM2 installiert"

# ── Git installieren (falls nicht vorhanden) ───────────────────
apt-get install -y git -qq
log "Git bereit"

# ── Repo klonen oder aktualisieren ────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Bestehendes Repo wird aktualisiert..."
  cd "$INSTALL_DIR"
  git pull
else
  info "Repository wird geklont..."
  mkdir -p /var/www
  git clone https://github.com/lolegah0711-jpg/acls-ready.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
log "Repo bereit in $INSTALL_DIR"

# ── NPM Pakete installieren ────────────────────────────────────
info "NPM-Pakete werden installiert..."
npm install --silent
log "Pakete installiert"

# ── Datenbank-Ordner sichern ───────────────────────────────────
mkdir -p "$INSTALL_DIR"

# ── .env Datei erstellen ───────────────────────────────────────
info ".env wird erstellt..."
cat > "$INSTALL_DIR/.env" <<EOF
# Automatisch generiert von setup.sh

DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET=$DISCORD_CLIENT_SECRET
DISCORD_REDIRECT_URI=https://$DOMAIN/auth/callback
DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
DISCORD_GUILD_ID=$DISCORD_GUILD_ID

BOT_API_SECRET=$BOT_API_SECRET
SERVER_URL=https://$DOMAIN

IC_CHANNEL_KEYWORDS=$IC_KEYWORDS
TRACK_ALL_CHANNELS=false

SESSION_SECRET=$SESSION_SECRET
NODE_ENV=production
PORT=3000

DB_PATH=$INSTALL_DIR/acls.db

ADMIN_DISCORD_IDS=$ADMIN_DISCORD_ID
ADMIN_USERNAMES=$ADMIN_USERNAME
EOF
chmod 600 "$INSTALL_DIR/.env"
log ".env erstellt (Secrets zufällig generiert)"

# ── Nginx Konfiguration ────────────────────────────────────────
info "Nginx wird konfiguriert..."
cat > /etc/nginx/sites-available/acls <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Weiterleitung zu HTTPS (wird von Certbot automatisch geändert)
    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
    }
}
EOF

# Standard-Seite deaktivieren, eigene aktivieren
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/acls /etc/nginx/sites-enabled/acls
nginx -t > /dev/null 2>&1 && systemctl reload nginx
log "Nginx konfiguriert für $DOMAIN"

# ── App mit PM2 starten ────────────────────────────────────────
info "App wird mit PM2 gestartet..."
cd "$INSTALL_DIR"
pm2 delete acls 2>/dev/null || true
pm2 start start.js --name acls
pm2 save

# PM2 Autostart bei Server-Neustart einrichten
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root > /dev/null 2>&1
systemctl enable pm2-root > /dev/null 2>&1 || true
log "App läuft (PM2)"

# ── SSL Zertifikat ─────────────────────────────────────────────
echo ""
warn "DNS muss bereits auf diesen Server zeigen damit SSL funktioniert."
read -p "  SSL-Zertifikat jetzt einrichten? (j/n): " DO_SSL

if [[ "$DO_SSL" =~ ^[Jj]$ ]]; then
  info "SSL-Zertifikat wird beantragt..."
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect
  log "SSL eingerichtet – HTTPS aktiv"
else
  warn "SSL übersprungen. Später ausführen: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# ── Firewall ───────────────────────────────────────────────────
info "Firewall wird konfiguriert..."
if command -v ufw &> /dev/null; then
  ufw allow OpenSSH   > /dev/null
  ufw allow 'Nginx Full' > /dev/null
  ufw --force enable  > /dev/null
  log "UFW Firewall aktiv (SSH + HTTP/HTTPS erlaubt)"
else
  warn "UFW nicht gefunden – Firewall manuell prüfen"
fi

# ── Fertig ─────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║            Installation fertig!             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
log "Website:  https://$DOMAIN"
log "App-Logs: pm2 logs acls"
log "Status:   pm2 status"
echo ""
echo -e "${YELLOW}Nächster Schritt – Discord Developer Portal:${NC}"
echo "  → Redirect URI hinzufügen: https://$DOMAIN/auth/callback"
echo "  → https://discord.com/developers/applications"
echo ""
echo -e "${YELLOW}Update einspielen (in Zukunft):${NC}"
echo "  cd $INSTALL_DIR && git pull && npm install && pm2 restart acls"
echo ""
