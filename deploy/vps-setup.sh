#!/usr/bin/env bash
# Deploy Phase 3 — ranking API on the VPS (ferramox.duckdns.org).
# Run ON THE VPS as root. Idempotent: safe to re-run. Stops on the first error
# and never touches the wedding site's config beyond the insertions below.
#
# Files are staged in /tmp by deploy/run-vps-deploy.ps1 (see plano-deploy.md).

set -euo pipefail

DOMAIN="ferramox.duckdns.org"
APP_DIR="/opt/ranking-api"
STAGE="/tmp"
CONF="/etc/nginx/sites-enabled/frontend"
CERT_DIR="/var/www/certbot"
EMAIL="${CERTBOT_EMAIL:-}"          # set with CERTBOT_EMAIL=you@example.com to go non-interactive

log() { echo "=== $* ==="; }

# ---------------------------------------------------------------- 3.1 + 3.2
log "3.1/3.2 install app + .env"
mkdir -p "$APP_DIR"
cp "$STAGE/server.js" "$STAGE/bootstrap.sql" "$STAGE/package.json" "$APP_DIR/"
cp "$STAGE/.env" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
shred -u -n 3 "$STAGE/.env" 2>/dev/null || { chmod 600 "$STAGE/.env"; rm -f "$STAGE/.env"; }
cd "$APP_DIR"
log "npm install"
npm install dotenv mysql2 jose

# ---------------------------------------------------------------- 3.3
log "3.3 ensure-table (idempotent)"
node server.js --ensure-table

# ---------------------------------------------------------------- 3.4
log "3.4 pm2 daemon (node listens on :8765)"
pm2 start server.js --name ranking-api || pm2 list
pm2 save

log "local health (node direct)"
curl -s "http://127.0.0.1:8765/api/health" || echo "NODE DOWN - check pm2 log"

# ---------------------------------------------------------------- certbot
CERT="/etc/letsencrypt/certificates/$DOMAIN"
if [ ! -e "$CERT/cert.pem" ]; then
  log "install certbot (was missing, found in 0.4)"
  apt-get update -y
  apt-get install -y certbot

  # The wedding app is proxied, so a plain --webroot on its own root would not
  # serve the ACME challenge. Add a dedicated challenge location first.
  if [ -f "$CONF" ] && ! grep -q "acme-challenge" "$CONF"; then
    log "insert /.well-known/acme-challenge/ location"
    mkdir -p "$CERT_DIR"
    cp "$CONF" "$CONF.bak"
    awk -v cert="$CERT_DIR" '
      { print }
      /server_name/ && !done { print "";
        print "    location /.well-known/acme-challenge/ { alias " cert "/; }";
        done=1 }
    ' "$CONF" > "$CONF.new" && mv "$CONF.new" "$CONF"
    nginx -t || { echo "acme insert rejected - restoring"; cp "$CONF.bak" "$CONF"; exit 1; }
    systemctl restart nginx
  fi

  log "certbot certonly (webroot)"
  if [ -n "$EMAIL" ]; then
    certbot certonly --webroot -w "$CERT_DIR" -d "$DOMAIN" \
      --non-interactive --agree-tos --email "$EMAIL"
  else
    certbot certonly --webroot -w "$CERT_DIR" -d "$DOMAIN"
  fi
else
  log "cert already present - skipping certbot"
fi

# ---------------------------------------------------------------- 3.5 nginx
log "3.5 nginx: proxy /ranking-api/ + HTTPS on the EXISTING server block"
if ! grep -q "ranking-api" "$CONF"; then
  cp "$CONF" "$CONF.bak2"
  awk '
    { print }
    /server_name/ && !done {
      print "";
      print "    # ranking API bridge -> node (longest prefix wins over /api/)";
      print "    location /ranking-api/ {";
      print "        proxy_pass http://127.0.0.1:8765/;   # bare / : browser already sends /ranking-api/api/...";
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;";
      print "        proxy_set_header X-Forwarded-Proto $scheme;";
      print "        proxy_set_header X-Real-IP $remote_addr;";
      print "        proxy_connect_timeout 3s;";
      print "        proxy_read_timeout 10s;";
      print "    }";
      done=1 }
  ' "$CONF" > "$CONF.new" && mv "$CONF.new" "$CONF"
fi

if ! grep -q "listen 443" "$CONF"; then
  awk -v cert="$CERT/cert.pem" -v key="$CERT/private/privkey.pem" '
    { print }
    /listen[[:space:]]+80/ && !ssl {
      print "    listen 443 ssl;";
      print "    ssl_certificate     " cert ";";
      print "    ssl_certificate_key " key ";";
      ssl=1 }
  ' "$CONF" > "$CONF.new" && mv "$CONF.new" "$CONF"
fi

log "nginx -T: show all locations (check for regex locations that could win)"
nginx -T 2>/dev/null | grep -n "location" || true

log "nginx -t"
if ! nginx -t; then
  echo "CONFIG REJECTED - restoring backup $CONF.bak2"
  cp "$CONF.bak2" "$CONF"
  exit 1
fi
systemctl restart nginx

# ---------------------------------------------------------------- verify
log "VERIFICATION"
echo "1) https ranking-api health:"
curl -sk "https://$DOMAIN/ranking-api/api/health" || echo "  HTTPS FAILS (mixed-content blocker not solved)"
echo "2) http ranking-api health:"
curl -s "http://$DOMAIN/ranking-api/api/health" || true
echo "3) REGRESSION wedding root must still be the wedding page:"
curl -s "http://$DOMAIN/" | head -c 200; echo
echo "4) REGRESSION wedding own /api/ must still be its 401 JSON:"
curl -s -o /dev/null -w "  /api/x -> %{http_code}\n" "http://$DOMAIN/api/x"
echo
echo "Done. Next: plano-deploy.md Phase 4 (Google origins + client_id) and Phase 5."
