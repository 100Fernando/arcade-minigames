#!/usr/bin/env bash
# Deploy Phase 3 (fix 2) — the /ranking-api/ proxy is present but the wedding
# block's REGEX location overrides it (nginx checks regex AFTER prefix). Fix:
# make our location `^~` so nginx stops at the prefix and never tests regexes.
# Also prints the config so the block structure is visible. Idempotent.

set -uo pipefail
DOMAIN="ferramox.duckdns.org"
CONF="/etc/nginx/sites-enabled/frontend"

log() { echo "=== $* ==="; }

log "config (numbered) — look for regex locations like 'location ~'"
grep -n "" "$CONF"

log "ranking-api location present?"
grep -n "ranking-api" "$CONF" || echo "NOT present"

if grep -q "location /ranking-api/" "$CONF" && ! grep -q "location \^~ /ranking-api/" "$CONF"; then
  log "upgrade to 'location ^~ /ranking-api/' (beats regex locations)"
  sed -i 's#location /ranking-api/#location ^~ /ranking-api/#' "$CONF"
elif ! grep -q "ranking-api" "$CONF"; then
  log "insert 'location ^~ /ranking-api/' in the DOMAIN block"
  cp "$CONF" "$CONF.bak6"
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
  ' "$CONF" > "$CONF.new" && mv "$CONF.new" "$CONF"
  grep -q "ranking-api" "$CONF" || echo "NOTE: no server_name line contains the domain - inspect the printout above"
else
  log "already ^~ - nothing to change"
fi

log "nginx -t"
if ! nginx -t; then
  echo "CONFIG REJECTED - restoring newest backup"
  for b in "$CONF.bak6" "$CONF.bak5" "$CONF.bak4"; do [ -f "$b" ] && { cp "$b" "$CONF"; break; }; done
  nginx -t || true
  exit 1
fi
systemctl restart nginx

log "VERIFICATION"
echo "1) https ranking-api health:"; curl -sk -m 10 "https://$DOMAIN/ranking-api/api/health"
echo "2) https ranking-api ranking:"; curl -sk -m 10 "https://$DOMAIN/ranking-api/api/ranking?game=all&limit=3"
echo "3) REGRESSION wedding root:";  curl -s -m 10 "http://$DOMAIN/" | head -c 120; echo
echo "4) REGRESSION wedding /api/x:"; curl -s -o /dev/null -m 10 -w "  -> %{http_code}\n" "http://$DOMAIN/api/x"
echo "5) HTTP->HTTPS redirect on our path:"; curl -s -o /dev/null -m 10 -w "  -> %{http_code} redirect=%{redirect_url}\n" "http://$DOMAIN/ranking-api/api/health"
