#!/usr/bin/env bash
# Phase 6 — make the /ranking-api/ proxy WebSocket-capable so the MP room
# transport (GET /api/mp/ws?code=...) can upgrade.
#
# nginx needs THREE things for an Upgrade request to reach the node server:
#   1) a top-level `map $http_upgrade $connection_upgrade` (outside any server block)
#   2) `proxy_http_version 1.1;` inside the location (1.0 cannot carry Upgrade)
#   3) `proxy_set_header Upgrade/Connection` inside the location
#
# Idempotent; backups go to /tmp ONLY (never inside sites-enabled/ — that is what
# created the frontend.bak* duplicate-site pollution before). `nginx -t` guards
# every write and restores on failure. The wedding app and the ranking API stay
# byte-identical in behaviour: the map only affects requests that carry an
# Upgrade header, which today is ONLY the MP client.

set -uo pipefail

DOM=ferramox.duckdns.org
CONF=/etc/nginx/sites-enabled/frontend

echo "=== A) map (top level, idempotent) ==="
if grep -q 'connection_upgrade' "$CONF"; then
  echo "already present"
else
  cp -p "$CONF" /tmp/frontend.ws.orig
  {
    echo "# ---- WebSocket upgrade mapping (Phase 6: /api/mp/ws) ----"
    echo 'map $http_upgrade $connection_upgrade {'
    echo '    default upgrade;'
    echo "    ''      close;"
    echo '}'
    echo ''
    cat "$CONF"
  } > /tmp/frontend.ws
  grep -q 'connection_upgrade' /tmp/frontend.ws || { echo "MAP INSERT FAILED"; exit 1; }
  cp /tmp/frontend.ws "$CONF"
  if ! nginx -t; then
    echo "nginx -t FAILED - restoring"; cp -p /tmp/frontend.ws.orig "$CONF"; exit 1
  fi
fi

echo "=== B) upgrade headers + http/1.1 inside /ranking-api/ (idempotent) ==="
if grep -q 'Upgrade \$http_upgrade' "$CONF"; then
  echo "already present"
else
  cp -p "$CONF" /tmp/frontend.ws2.orig
  awk '
    { print }
    /proxy_pass http:\/\/127\.0\.0\.1:8765\// && !done {
      done = 1
      print "        proxy_http_version 1.1;                       # Upgrade needs 1.1, not the 1.0 default"
      print "        proxy_set_header Upgrade $http_upgrade;"
      print "        proxy_set_header Connection $connection_upgrade;"
    }
  ' "$CONF" > /tmp/frontend.ws2
  grep -q 'Upgrade \$http_upgrade' /tmp/frontend.ws2 || { echo "HEADER INSERT FAILED"; cp -p /tmp/frontend.ws2.orig "$CONF"; exit 1; }
  cp /tmp/frontend.ws2 "$CONF"
  if ! nginx -t; then
    echo "nginx -t FAILED - restoring"; cp -p /tmp/frontend.ws2.orig "$CONF"; exit 1
  fi
fi

echo "=== C) restart nginx ==="
systemctl restart nginx && sleep 2

echo
echo "=== D) acceptance: ws upgrade reaches node + both apps still green ==="
# An unknown room code makes OUR server answer 400 after the upgrade attempt;
# nginx blocking the Upgrade would show 404/502 instead. Either 101 or 400 = OK.
printf 'mp ws upgrade        : %s (101 or 400 = upgrade reached node)\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Key: dGcqHqk9C+rk12EwZq4KB8h4svBgqCk8xJVeVG90HWU=' -H 'Sec-WebSocket-Version: 13' "https://$DOM/ranking-api/api/mp/ws?code=TEST")"
printf 'ranking-api health   : %s\n' "$(curl -sk -m 10 -o /tmp/rk.json -w '%{http_code}' https://$DOM/ranking-api/api/health) $(head -c 120 /tmp/rk.json)"
printf 'wedding root (https) : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://$DOM/)"
printf 'wedding /api/x       : %s (must be 401)\n' "$(curl -sk -m 10 -o /tmp/api.json -w '%{http_code}' https://$DOM/api/x) $(head -c 90 /tmp/api.json)"
printf 'arcade / (https)     : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://$DOM/arcade/)"
echo
echo "=== E) the config as loaded (ranking-api block) ==="
nginx -T 2>/dev/null | sed -n '/ranking-api/,+12p'
