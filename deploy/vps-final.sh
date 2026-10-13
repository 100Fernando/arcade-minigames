#!/usr/bin/env bash
# Phase 3 finale — run ON THE VPS.
#
# The domain root is owned by the WEDDING app ("Casamento Graziele & Fernando"):
# one nginx server block (`frontend`, server_name _) serves its static site and
# proxies /api/ to :3001. This script NEVER replaces that block. It only:
#   1) deletes the backup files that were polluting sites-enabled (they were
#      loaded as duplicate catch-all sites -> "conflicting server_name _"),
#   2) (re-)issues the HTTPS cert with certbot --nginx (idempotent),
#   3) ADDS a `location ^~ /ranking-api/` proxy to :8765 inside the SAME block,
#   4) validates + restarts, then proves BOTH apps still work.
#
# Backups are written to /tmp ONLY — never inside sites-enabled/ (that was the
# bug that created frontend.bak / frontend.bak6).

set -uo pipefail

DOM=ferramox.duckdns.org
CONF=/etc/nginx/sites-enabled/frontend
EMAIL=fernando-klj@hotmail.com
APIPORT=8765

echo "=== 0) ranking-api upstream is alive (before any nginx change) ==="
curl -s -m 5 http://127.0.0.1:$APIPORT/api/health || echo "UPSTREAM DOWN"
echo

echo "=== 1) remove backup pollution from sites-enabled ==="
for f in /etc/nginx/sites-enabled/frontend.bak*; do
  [ -e "$f" ] && rm -f "$f" && echo "removed $f"
done
ls -l /etc/nginx/sites-enabled/
echo

echo "=== 2) backup OUTSIDE sites-enabled ==="
cp -p "$CONF" /tmp/frontend.pre-certbot
echo "saved: /tmp/frontend.pre-certbot"

echo "=== 3) certbot (idempotent, non-interactive) ==="
CERT_OK=0
if certbot --nginx -d "$DOM" --non-interactive --agree-tos --email "$EMAIL"; then
  CERT_OK=1
else
  echo "--nginx plugin failed (server_name _ is a catch-all) - falling back to webroot"
  tail -n 12 /var/log/letsencrypt/letsencrypt.log
  mkdir -p /var/www/certbot
  certbot certonly --webroot -w /var/www/certbot -d "$DOM" \
    --non-interactive --agree-tos --email "$EMAIL" && CERT_OK=1
fi
if [ "$CERT_OK" -ne 1 ]; then
  echo "certbot FAILED:"; tail -n 25 /var/log/letsencrypt/letsencrypt.log
  cp -p /tmp/frontend.pre-certbot "$CONF"; exit 1
fi
nginx -t || { echo "nginx -t FAILED after certbot"; cp -p /tmp/frontend.pre-certbot "$CONF"; exit 1; }
echo

echo "=== 4) insert location ^~ /ranking-api/ into the SAME block ==="
if grep -q 'ranking-api' "$CONF"; then
  echo "already present - skipping insert"
else
  awk -v port="$APIPORT" '
    { print }
    /server_name/ && !done {
      done = 1
      print ""
      print "    # ---- arcade-minigames ranking API (separate prefix) ----"
      print "    # ^~ so no regex location can shadow it; the wedding location /api/ stays intact"
      print "    location ^~ /ranking-api/ {"
      print "        proxy_pass http://127.0.0.1:" port "/;   # bare / strips only /ranking-api/"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "    }"
    }
  ' "$CONF" > /tmp/frontend.new
  if ! grep -q 'ranking-api' /tmp/frontend.new; then
    echo "INSERT FAILED (no server_name line matched) - leaving config untouched"; exit 1
  fi
  cp -p "$CONF" /tmp/frontend.pre-insert
  cp /tmp/frontend.new "$CONF"
  if ! nginx -t; then
    echo "nginx -t FAILED - restoring pre-insert config"
    cp -p /tmp/frontend.pre-insert "$CONF"; nginx -t; exit 1
  fi
fi
echo

echo "=== 5) restart nginx ==="
systemctl restart nginx && sleep 2
systemctl status nginx --no-pager | head -n 4

echo
echo "=== 4b) HTTPS directives present? (webroot path needs them added by hand) ==="
if ! nginx -T 2>/dev/null | grep -q 'listen 443'; then
  echo "no listen 443 loaded - adding ssl + cert paths to the SAME block"
  awk -v dom="$DOM" '
    /listen 80;/ && !added {
      print; print "    listen 443 ssl;"; print "    listen [::]:443 ssl;";
      print "    ssl_certificate     /etc/letsencrypt/certificates/" dom ".pem;";
      print "    ssl_certificate_key /etc/letsencrypt/certificates/" dom "-key.pem;";
      added = 1; next
    }
    { print }
  ' "$CONF" > /tmp/frontend.ssl
  if grep -q 'listen 443' /tmp/frontend.ssl; then
    cp /tmp/frontend.ssl "$CONF"
    nginx -t || { echo "nginx -t FAILED after ssl insert - restoring"; cp -p /tmp/frontend.pre-certbot "$CONF"; nginx -t; exit 1; }
  fi
fi
nginx -T 2>/dev/null | grep -nE 'listen ' | sed 's/^ *//'

echo
echo "=== 6) the four acceptance points (BOTH apps must work) ==="
printf 'ranking-api health : %s\n' "$(curl -sk -m 10 -o /tmp/rk.json -w '%{http_code}' https://$DOM/ranking-api/api/health) $(head -c 120 /tmp/rk.json)"
printf 'ranking board      : %s\n' "$(curl -sk -m 10 -o /tmp/rkb.json -w '%{http_code}' "https://$DOM/ranking-api/api/ranking?game=alvos&limit=3") $(head -c 120 /tmp/rkb.json)"
printf 'wedding root       : %s\n' "$(curl -s -m 10 -o /tmp/wed.html -w '%{http_code}' http://$DOM/)"
printf 'wedding /api/x     : %s (must be 401 from Express)\n' "$(curl -s -m 10 -o /tmp/api.json -w '%{http_code}' http://$DOM/api/x) $(head -c 90 /tmp/api.json)"
printf 'https wedding root : %s\n' "$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://$DOM/)"
echo
echo "=== locations now loaded ==="
nginx -T 2>/dev/null | grep -nE 'location |listen ' | sed 's/^ *//'
echo
echo "=== cert ==="
certbot certificates 2>/dev/null | sed -n '1,12p'
