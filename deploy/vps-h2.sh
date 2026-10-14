#!/usr/bin/env bash
# Phase 8 — geography-independent latency win on the existing VPS (no new host).
#
# The WS transport is already persistent (20 Hz push, ~140-180 ms steady = the
# irreducible Brazil<->USA leg). What real users ALSO pay, and what the probes
# showed as 450 ms cold / 2.17 s spikes, is the TLS HANDSHAKE + nginx closing
# idle upstream connections (no keepalive). Those are pure wire waste, not
# physics. Fix them without moving the server:
#   1) TLS session resumption: ssl_session_cache shared + reuse -> repeat
#      handshakes cost ~1 round trip, not a full ClientHello/ServerHello.
#   2) upstream keepalive: nginx keeps the connection to :8765 open (proxy_read
#      timeout was 10s; add `keepalive 64` + `keepalive_timeout 30s` so the
#      polling fallback and lobby/create/join/login reuse the open socket).
# HTTP/2 is intentionally NOT enabled: nginx 1.24 does not proxy WebSocket
# upgrades cleanly over h2, and the WS path is the primary transport.
#
# Idempotent; backups in /tmp ONLY; `nginx -t` guards every write and restores.

set -uo pipefail
CONF=/etc/nginx/sites-enabled/frontend

echo "=== A) TLS session resumption (top-level, idempotent) ==="
if grep -q 'ssl_session_cache' "$CONF"; then
  echo "already present"
else
  cp -p "$CONF" /tmp/frontend.h2.orig
  {
    echo "# ---- TLS session resumption: repeat handshakes cost ~1 round trip ----"
    echo 'ssl_session_cache shared:SSL:10m;'
    echo 'ssl_session_tickets off;'
    echo ''
    cat "$CONF"
  } > /tmp/frontend.h2
  grep -q 'ssl_session_cache' /tmp/frontend.h2 || { echo "INSERT FAILED"; cp -p /tmp/frontend.h2.orig "$CONF"; exit 1; }
  cp /tmp/frontend.h2 "$CONF"
  if ! nginx -t; then echo "nginx -t FAILED - restoring"; cp -p /tmp/frontend.h2.orig "$CONF"; exit 1; fi
fi

echo "=== B) upstream keepalive via a named upstream (idempotent) ==="
# `keepalive` is NOT valid inside a location - it belongs in an `upstream` block.
# Convert the proxy_pass target to a named upstream that keeps the connection to
# :8765 open (kills the idle-close + re-handshake waste on the polling fallback
# and lobby/create/join/login). proxy_pass http://rkapi/ keeps the bare-/ prefix
# strip identical to http://127.0.0.1:8765/. Guarded: nginx -t restores on failure.
if grep -q 'upstream rkapi' "$CONF"; then
  echo "already present"
else
  cp -p "$CONF" /tmp/frontend.h2b.orig
  {
    echo "# ---- keep the upstream conn to :8765 open (no idle-close re-handshake) ----"
    echo 'upstream rkapi {'
    echo '    keepalive 64;'
    echo '    keepalive_timeout 30s;'
    echo '    keepalive_requests 1000;'
    echo '    server 127.0.0.1:8765;'
    echo '}'
    echo ''
    cat "$CONF"
  } > /tmp/frontend.h2b
  # rewrite the proxy_pass target to the named upstream (same bare-/ strip)
  sed -i 's#proxy_pass http://127\.0\.0\.1:8765/;#proxy_pass http://rkapi/;#' /tmp/frontend.h2b
  grep -q 'upstream rkapi' /tmp/frontend.h2b || { echo "UPSTREAM INSERT FAILED"; cp -p /tmp/frontend.h2b.orig "$CONF"; exit 1; }
  grep -q 'proxy_pass http://rkapi/' /tmp/frontend.h2b || { echo "PROXY REWRITE FAILED"; cp -p /tmp/frontend.h2b.orig "$CONF"; exit 1; }
  cp /tmp/frontend.h2b "$CONF"
  if ! nginx -t; then echo "nginx -t FAILED - restoring"; cp -p /tmp/frontend.h2b.orig "$CONF"; exit 1; fi
fi

echo "=== C) restart nginx ==="
systemctl restart nginx && sleep 2

echo
echo "=== D) acceptance: ws upgrade + both apps intact ==="
printf 'mp ws upgrade        : %s (101 or 400 = upgrade reached node)\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Key: dGcqHqk9C+rk12EwZq4KB8h4svBgqCk8xJVeVG90HWU=' -H 'Sec-WebSocket-Version: 13' "https://ferramox.duckdns.org/ranking-api/api/mp/ws?code=TEST")"
printf 'ranking-api health   : %s\n' "$(curl -sk -m 10 -o /tmp/rk.json -w '%{http_code}' https://ferramox.duckdns.org/ranking-api/api/health) $(head -c 120 /tmp/rk.json)"
printf 'wedding root (https) : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://ferramox.duckdns.org/)"
printf 'wedding /api/x       : %s (must be 401)\n' "$(curl -sk -m 10 -o /tmp/api.json -w '%{http_code}' https://ferramox.duckdns.org/api/x) $(head -c 90 /tmp/api.json)"
printf 'arcade / (https)     : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://ferramox.duckdns.org/arcade/)"
echo
echo "=== E) the block as loaded ==="
nginx -T 2>/dev/null | sed -n '/ranking-api/,+16p'
