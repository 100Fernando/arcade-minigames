#!/usr/bin/env bash
# Deploy Phase 3 (retry) — fixes the two failures of the first run:
#   a) the ACME challenge 404: my awk inserted the location after the FIRST
#      `server_name` in the file, which is NOT the ferramox block (nginx also
#      warns "conflicting server name _"). Fix: restore the pristine config from
#      the .bak the first run saved, and let certbot's nginx plugin edit the
#      correct block itself.
#   b) "NODE DOWN": diagnose pm2 + the local health curl before touching nginx.
#
# Idempotent. Run as root on the VPS.

set -uo pipefail

DOMAIN="ferramox.duckdns.org"
APP_DIR="/opt/ranking-api"
CONF="/etc/nginx/sites-enabled/frontend"
EMAIL="${CERTBOT_EMAIL:-fernando-klj@hotmail.com}"

log() { echo "=== $* ==="; }

# ---------------------------------------------------------------- diagnose node
log "node/pm2 state"
sleep 3
pm2 ls
pm2 log ranking-api -n 25 || true
curl -s -m 5 "http://127.0.0.1:8765/api/health" || echo "local health STILL failing -> pm2 log above explains why"

# ---------------------------------------------------------------- restore config
if [ -f "$CONF.bak" ]; then
  log "restore pristine nginx config (undo the wrong acme insert)"
  cp "$CONF.bak" "$CONF"
else
  log "no backup found - leaving config as is"
fi
log "current config (numbered, so the blocks are visible)"
grep -n "" "$CONF" | head -60
log "all enabled sites"
ls -l /etc/nginx/sites-enabled/

# ---------------------------------------------------------------- certbot (nginx plugin)
if [ ! -e "/etc/letsencrypt/certificates/$DOMAIN/cert.pem" ]; then
  log "install certbot nginx plugin"
  apt-get install -y python3-certbot-nginx || apt-get install -y certbot

  log "certbot --nginx (plugin edits the RIGHT block: challenge + HTTPS)"
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL"; then
    log "plugin OK"
  else
    log "plugin failed - manual webroot in the DOMAIN block"
    mkdir -p /var/www/certbot
    cp "$CONF" "$CONF.bak4"
    awk -v dom="$DOMAIN" -v wroot="/var/www/certbot" '
      { print }
      /server_name/ && index($0, dom) && !done {
        print ""
        print "    location /.well-known/acme-challenge/ { alias " wroot "/; }";
        done=1 }
    ' "$CONF" > "$CONF.new" && mv "$CONF.new" "$CONF"
    grep -q "acme-challenge" "$CONF" || echo "NOTE: no server_name line contains the domain - inspect the printout above"
    nginx -t || { cp "$CONF.bak4" "$CONF"; echo "rejected - restored"; exit 1; }
    systemctl restart nginx
    certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL"
  fi
else
  log "cert already present"
fi

# ---------------------------------------------------------------- ranking-api proxy
log "insert location /ranking-api/ in the block whose server_name has the domain"
if ! grep -q "ranking-api" "$CONF"; then
  cp "$CONF" "$CONF.bak3"
  awk -v dom="$DOMAIN" '
    { print }
    /server_name/ && index($0, dom) && !done {
      print "";
      print "    # ranking API bridge -> node (longest prefix wins over /api/)";
      print "    location /ranking-api/ {";
      print "        proxy_pass http://127.0.0.1:8765/;   # bare / : browser sends /ranking-api/api/...";
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;";
      print "        proxy_set_header X-Forwarded-Proto $scheme;";
      print "        proxy_set_header X-Real-IP $remote_addr;";
      print "        proxy_connect_timeout 3s;";
      print "        proxy_read_timeout 10s;";
      print "    }";
      done=1 }
  ' "$CONF" > "$CONF.new" && mv "$CONF.new" "$CONF"
  grep -q "ranking-api" "$CONF" || echo "NOTE: no server_name line contained the domain - check the config above"
fi

log "nginx -t"
if ! nginx -t; then
  echo "CONFIG REJECTED - restoring $CONF.bak3"
  cp "$CONF.bak3" "$CONF"
  exit 1
fi
systemctl restart nginx

# ---------------------------------------------------------------- verify
log "VERIFICATION"
echo "1) https ranking-api health:"; curl -sk -m 10 "https://$DOMAIN/ranking-api/api/health" || echo "  HTTPS FAILS"
echo "2) http ranking-api health:";  curl -s -m 10 "http://$DOMAIN/ranking-api/api/health" || true
echo "3) REGRESSION wedding root:";  curl -s -m 10 "http://$DOMAIN/" | head -c 200; echo
echo "4) REGRESSION wedding /api/x:"; curl -s -o /dev/null -m 10 -w "  -> %{http_code}\n" "http://$DOMAIN/api/x"
echo
echo "Done."
