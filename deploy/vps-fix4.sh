#!/usr/bin/env bash
# Deploy Phase 3 (fix 4) — locate the domain block via `nginx -T` (sites-enabled
# are SYMLINKS, so grep -rl skipped them; nginx -T prints real file paths).
# Find the file certbot --nginx gave `listen 443 ssl` (that IS the domain block),
# insert `location ^~ /ranking-api/` there, guard with nginx -t, restart, verify.

set -uo pipefail
DOMAIN="ferramox.duckdns.org"

log() { echo "=== $* ==="; }

log "nginx -T: file headers + the 443/server_name lines (find the domain block)"
nginx -T 2>/dev/null | grep -nE '# configuration file|server_name|listen 443|location'

# The certbot-edited file = the "# configuration file X" header that precedes a
# `listen 443` line.
TARGET=$(nginx -T 2>/dev/null | awk '
  /^# configuration file / { f=$0; sub(/^# configuration file /,"",f); sub(/:$/,"",f) }
  /listen[[:space:]]+443/ { if (f) print f }
' | head -1)

if [ -z "$TARGET" ]; then echo "FATAL: no file has listen 443 - inspect the nginx -T printout above"; exit 1; fi
log "TARGET file = $TARGET"
grep -n "" "$TARGET"

if grep -q "ranking-api" "$TARGET"; then
  log "ranking-api already in TARGET - ensuring ^~"
  sed -i 's#location /ranking-api/#location ^~ /ranking-api/#' "$TARGET"
else
  log "insert 'location ^~ /ranking-api/' after the first server_name in TARGET"
  cp "$TARGET" "$TARGET.bak"
  awk '
    { print }
    /server_name/ && !done {
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
  grep -q "ranking-api" "$TARGET" || echo "NOTE: TARGET has no server_name line - inspect the printout above"
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
