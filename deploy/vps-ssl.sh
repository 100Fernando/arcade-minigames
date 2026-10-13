#!/usr/bin/env bash
# Phase 3 finale, part 2 — HTTPS directives + /ranking-api/ proxy.
#
# The cert ALREADY exists (/etc/letsencrypt/live/ferramox.duckdns.org/), but
# certbot's nginx installer refuses to edit this block because server_name is
# the catch-all `_`. So the ssl directives are added by hand INTO THE SAME
# block — the wedding app (static root + location /api/ -> :3001) is untouched.
#
# Backups go to /tmp ONLY (never inside sites-enabled/, which is what created
# the frontend.bak* duplicate-site pollution before).

set -uo pipefail

DOM=ferramox.duckdns.org
CONF=/etc/nginx/sites-enabled/frontend
LIVE=/etc/letsencrypt/live/$DOM
APIPORT=8765

[ -e "$LIVE/privkey.pem" ] || { echo "NO CERT at $LIVE - run certbot first"; exit 1; }

cp -p "$CONF" /tmp/frontend.orig
echo "backup: /tmp/frontend.orig"

echo "=== A) listen 443 ssl + cert paths (idempotent) ==="
if grep -q 'listen 443' "$CONF"; then
  echo "already present"
else
  awk -v live="$LIVE" '
    /listen 80;/ && !added {
      print; print "    listen [::]:443 ssl;"; print "    listen 443 ssl;";
      print "    ssl_certificate     " live "/fullchain.pem;";
      print "    ssl_certificate_key " live "/privkey.pem;";
      added = 1; next
    }
    { print }
  ' "$CONF" > /tmp/frontend.ssl
  grep -q 'listen 443' /tmp/frontend.ssl || { echo "INSERT FAILED"; exit 1; }
  cp /tmp/frontend.ssl "$CONF"
  nginx -t || { echo "nginx -t FAILED - restoring"; cp -p /tmp/frontend.orig "$CONF"; exit 1; }
fi

echo "=== B) location ^~ /ranking-api/ -> :$APIPORT (idempotent) ==="
if grep -q 'ranking-api' "$CONF"; then
  echo "already present"
else
  awk -v port="$APIPORT" '
    { print }
    /server_name/ && !done {
      done = 1
      print ""
      print "    # ---- arcade-minigames ranking API (separate prefix) ----"
      print "    # ^~ so no regex location can shadow it; wedding location /api/ stays intact"
      print "    location ^~ /ranking-api/ {"
      print "        proxy_pass http://127.0.0.1:" port "/;   # bare / strips only /ranking-api/"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "    }"
    }
  ' "$CONF" > /tmp/frontend.api
  grep -q 'ranking-api' /tmp/frontend.api || { echo "INSERT FAILED"; cp -p /tmp/frontend.orig "$CONF"; exit 1; }
  cp /tmp/frontend.api "$CONF"
  if ! nginx -t; then
    echo "nginx -t FAILED - restoring pre-B config"
    cp -p /tmp/frontend.ssl "$CONF"; nginx -t; exit 1
  fi
fi

echo "=== C) restart ==="
systemctl restart nginx && sleep 2

echo
echo "=== D) the config as loaded ==="
cat -n "$CONF"
echo
echo "=== E) acceptance: BOTH apps must work ==="
printf 'ranking-api health   : %s\n' "$(curl -sk -m 10 -o /tmp/rk.json -w '%{http_code}' https://$DOM/ranking-api/api/health) $(head -c 130 /tmp/rk.json)"
printf 'ranking board        : %s\n' "$(curl -sk -m 10 -o /tmp/rkb.json -w '%{http_code}' "https://$DOM/ranking-api/api/ranking?game=alvos&limit=3") $(head -c 130 /tmp/rkb.json)"
printf 'wedding root (http)  : %s\n' "$(curl -s -m 10 -o /tmp/wed.html -w '%{http_code}' http://$DOM/) $(head -c 60 /tmp/wed.html)"
printf 'wedding root (https) : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://$DOM/)"
printf 'wedding /api/x       : %s (must be 401)\n' "$(curl -s -m 10 -o /tmp/api.json -w '%{http_code}' http://$DOM/api/x) $(head -c 90 /tmp/api.json)"
printf 'http ranking-api     : %s (must NOT be 404/HTML)\n' "$(curl -s -m 10 -o /tmp/h.json -w '%{http_code}' http://$DOM/ranking-api/api/health) $(head -c 90 /tmp/h.json)"
echo
echo "=== F) certbot renewal hook ==="
certbot certificates 2>/dev/null | sed -n '1,12p'
