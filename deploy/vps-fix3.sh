#!/usr/bin/env bash
# Deploy Phase 3 (fix 3) — the domain block is NOT in `frontend` (that file is a
# catch-all `server_name _`). Find the file whose server_name contains the domain
# (the one certbot --nginx edited to add HTTPS) and insert `location ^~ /ranking-api/`
# there, so /ranking-api/ -> our node :8765 while / and /api/ stay the wedding site.

set -uo pipefail
DOMAIN="ferramox.duckdns.org"

log() { echo "=== $* ==="; }

log "which enabled file owns the domain (server_name) + has 443"
grep -rl "server_name.*$DOMAIN" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null || echo "no explicit server_name with domain"
log "which enabled file has listen 443 (certbot target)"
grep -rl "listen 443" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null

# pick the domain file; fall back to the 443 file certbot edited
TARGET=$(grep -rl "server_name.*$DOMAIN" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -1)
[ -z "$TARGET" ] && TARGET=$(grep -rl "listen 443" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -1)
if [ -z "$TARGET" ]; then echo "FATAL: cannot locate the domain block - inspect the greps above"; exit 1; fi
log "TARGET file = $TARGET"
grep -n "" "$TARGET"

if grep -q "ranking-api" "$TARGET"; then
  log "ranking-api already in TARGET - ensuring ^~"
  sed -i 's#location /ranking-api/#location ^~ /ranking-api/#' "$TARGET"
else
  log "insert 'location ^~ /ranking-api/' after the domain server_name in TARGET"
  cp "$TARGET" "$TARGET.bak"
  awk -v dom="$DOMAIN" '
    { print }
    /server_name/ && index($0, dom) && !done {
      print "";
      print "    # ranking API bridge -> node (^~ = stop here, never test regex locations)";
      print "    location ^~ /ranking-api/ {";
      print "        proxy_pass http://127.0.0.1:8765/;   # bare / : browser sends /ranking-api/api/...";
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;";
      print "        proxy_set_header X-Forwarded-Proto $scheme;";
      print "        proxy_set_header X-Real-IP $remote_addr;";
      print "        proxy_connect_timeout 3s;";
      print "        proxy_read_timeout 10s;";
      print "    }";
      done=1 }
  ' "$TARGET" > "$TARGET.new" && mv "$TARGET.new" "$TARGET"
  grep -q "ranking-api" "$TARGET" || echo "NOTE: server_name line lacked the domain - check the printout above"
fi

log "nginx -t"
if ! nginx -t; then
  echo "CONFIG REJECTED - restoring $TARGET.bak"
  [ -f "$TARGET.bak" ] && cp "$TARGET.bak" "$TARGET"
  nginx -t || true
  exit 1
fi
systemctl restart nginx

log "VERIFICATION"
echo "1) https ranking-api health:";   curl -sk -m 10 "https://$DOMAIN/ranking-api/api/health"
echo "2) https ranking-api ranking:";  curl -sk -m 10 "https://$DOMAIN/ranking-api/api/ranking?game=all&limit=3"
echo "3) REGRESSION wedding root:";    curl -s -m 10 "http://$DOMAIN/" | head -c 120; echo
echo "4) REGRESSION wedding /api/x:";  curl -s -o /dev/null -m 10 -w "  -> %{http_code}\n" "http://$DOMAIN/api/x"
