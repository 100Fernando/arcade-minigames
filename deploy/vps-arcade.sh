#!/usr/bin/env bash
# Serve the arcade-minigames frontend at the SUBPATH /arcade/ on the SAME domain
# as the wedding app, and add the Cross-Origin-Opener-Policy header that makes the
# Google sign-in BUTTON work (the button returns the credential via cross-frame
# postMessage; GitHub Pages cannot send this header, so the button only works here).
#
# The wedding app (location / + location /api/ -> :3001) and the ranking API
# (location ^~ /ranking-api/) are UNTOUCHED. Backups go to /tmp ONLY (never inside
# sites-enabled/, which is what created the frontend.bak* pollution before).

set -uo pipefail

DOM=ferramox.duckdns.org
CONF=/etc/nginx/sites-enabled/frontend
WEBROOT=/var/www/arcade

echo "=== A) ensure the arcade webroot exists ==="
mkdir -p "$WEBROOT"
echo "webroot: $WEBROOT"

echo "=== B) location ^~ /arcade/ + COOP header (idempotent) ==="
if grep -q '/arcade/' "$CONF"; then
  echo "already present"
else
  cp -p "$CONF" /tmp/frontend.arcade.orig
  awk '
    { print }
    /server_name/ && !done {
      done = 1
      print ""
      print "    # ---- arcade-minigames frontend (subpath /arcade/) ----"
      print "    # COOP lets the GSI button postMessage the credential back to the page."
      print "    # alias maps /arcade/<file> -> /var/www/arcade/<file>; wedding untouched."
      print "    location ^~ /arcade/ {"
      print "        alias /var/www/arcade/;"
      print "        index index.html;"
      print "        add_header Cross-Origin-Opener-Policy \"unset\";"
      print "    }"
    }
  ' "$CONF" > /tmp/frontend.arcade
  grep -q '/arcade/' /tmp/frontend.arcade || { echo "INSERT FAILED"; cp -p /tmp/frontend.arcade.orig "$CONF"; exit 1; }
  cp /tmp/frontend.arcade "$CONF"
  if ! nginx -t; then
    echo "nginx -t FAILED - restoring"
    cp -p /tmp/frontend.arcade.orig "$CONF"; nginx -t; exit 1
  fi
fi

echo "=== C) restart nginx ==="
systemctl restart nginx && sleep 2

echo
echo "=== D) the config as loaded ==="
cat -n "$CONF"

echo
echo "=== E) acceptance: arcade + COOP, wedding + ranking-api still green ==="
printf 'arcade / (https)     : %s\n' "$(curl -sk -m 10 -o /tmp/ar.html -w '%{http_code}' https://$DOM/arcade/) $(head -c 60 /tmp/ar.html)"
printf 'arcade COOP header   : %s\n' "$(curl -sk -m 10 -D - -o /dev/null https://$DOM/arcade/ | grep -i 'cross-origin-opener-policy' | tr -d '\r')"
printf 'arcade script.js     : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://$DOM/arcade/script.js)"
printf 'ranking-api health   : %s\n' "$(curl -sk -m 10 -o /tmp/rk.json -w '%{http_code}' https://$DOM/ranking-api/api/health) $(head -c 120 /tmp/rk.json)"
printf 'wedding root (https) : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://$DOM/)"
printf 'wedding /api/x       : %s (must be 401)\n' "$(curl -sk -m 10 -o /tmp/api.json -w '%{http_code}' https://$DOM/api/x) $(head -c 90 /tmp/api.json)"
