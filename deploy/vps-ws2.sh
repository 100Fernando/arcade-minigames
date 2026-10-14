#!/usr/bin/env bash
# Phase 7 — kill the multiplayer input lag at the nginx layer.
#
# Measured on the live box (probe-input-lag.js):
#   direct to node (:8765, no nginx)  -> input lag 15-32 ms   (perfect)
#   through nginx (/ranking-api/)     -> input lag 170-190 ms median, 1.2 s tail
# The node sim and the WS transport are fine. nginx 1.24 defaults
# `proxy_request_buffering on` (client -> upstream frames get held in a 16k
# buffer before they reach node) and `proxy_buffering on` (upstream -> client
# responses get held too). For a WebSocket, every client frame IS the request
# body stream, so each keypress waits for nginx to flush its buffer.
#
# Fix: turn BOTH off inside the /ranking-api/ location only. The API answers are
# tiny JSON (< 8 KB) and the wedding app has its own location, so nothing else
# changes behaviour. Idempotent; backups in /tmp ONLY (never sites-enabled/);
# `nginx -t` guards every write and restores on failure.

set -uo pipefail

DOM=ferramox.duckdns.org
CONF=/etc/nginx/sites-enabled/frontend

echo "=== A) buffering off inside /ranking-api/ (idempotent) ==="
if grep -q 'proxy_request_buffering off' "$CONF"; then
  echo "already present"
else
  cp -p "$CONF" /tmp/frontend.buf.orig
  awk '
    { print }
    /proxy_pass http:\/\/127\.0\.0\.1:8765\// && !done {
      done = 1
      print "        proxy_buffering off;                        # WS: never hold a snapshot in a 4k buffer"
      print "        proxy_request_buffering off;                # WS: ship each client frame to node immediately"
    }
  ' "$CONF" > /tmp/frontend.buf
  grep -q 'proxy_request_buffering off' /tmp/frontend.buf || { echo "INSERT FAILED"; cp -p /tmp/frontend.buf.orig "$CONF"; exit 1; }
  cp /tmp/frontend.buf "$CONF"
  if ! nginx -t; then
    echo "nginx -t FAILED - restoring"; cp -p /tmp/frontend.buf.orig "$CONF"; exit 1
  fi
fi

echo "=== B) restart nginx ==="
systemctl restart nginx && sleep 2

echo
echo "=== C) acceptance: ws upgrade + both apps intact ==="
printf 'mp ws upgrade        : %s (101 or 400 = upgrade reached node)\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Key: dGcqHqk9C+rk12EwZq4KB8h4svBgqCk8xJVeVG90HWU=' -H 'Sec-WebSocket-Version: 13' "https://$DOM/ranking-api/api/mp/ws?code=TEST")"
printf 'ranking-api health   : %s\n' "$(curl -sk -m 10 -o /tmp/rk.json -w '%{http_code}' https://$DOM/ranking-api/api/health) $(head -c 120 /tmp/rk.json)"
printf 'wedding root (https) : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://$DOM/)"
printf 'wedding /api/x       : %s (must be 401)\n' "$(curl -sk -m 10 -o /tmp/api.json -w '%{http_code}' https://$DOM/api/x) $(head -c 90 /tmp/api.json)"
printf 'arcade / (https)     : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://$DOM/arcade/)"
echo
echo "=== D) the block as loaded ==="
nginx -T 2>/dev/null | sed -n '/ranking-api/,+16p'
