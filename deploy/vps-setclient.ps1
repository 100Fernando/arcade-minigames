# Phase 4 — set GOOGLE_CLIENT_ID on the VPS (key auth, zero prompts).
#
# The client id is PUBLIC (it is embedded in index.html), so it is safe to pass
# as an argument. This script writes it into /opt/ranking-api/.env idempotently
# (replaces an existing line, or appends), restarts pm2, and proves the flip by
# reading /api/health -> login: "google".
#
# Usage:
#   deploy\vps-setclient.ps1 1234567890-abcdef.apps.googleusercontent.com
#   deploy\vps-setclient.ps1 -clear        # remove the line (back to login: off)

param(
  [Parameter(Position = 0)][string]$clientId = "",
  [switch]$clear
)

$VPS = "ferramox-vps"

if ($clear) {
  ssh $VPS "sed -i '/^GOOGLE_CLIENT_ID/d' /opt/ranking-api/.env; pm2 restart ranking-api; sleep 3; curl -s http://127.0.0.1:8765/api/health"
  return
}

if (-not $clientId) {
  Write-Host "usage: deploy\vps-setclient.ps1 <client-id.apps.googleusercontent.com>"
  exit 1
}

if ($clientId -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') {
  Write-Host "WARN: '$clientId' does not look like a Web OAuth client id - continuing anyway"
}

# single-quoted remote heredoc: nothing is expanded locally
ssh $VPS "cd /opt/ranking-api && cp .env .env.pre-client 2>/dev/null; \
  grep -q '^GOOGLE_CLIENT_ID' .env && sed -i 's|^GOOGLE_CLIENT_ID.*|GOOGLE_CLIENT_ID = $clientId|' .env || printf '\nGOOGLE_CLIENT_ID = %s\n' '$clientId' >> .env; \
  chmod 600 .env; \
  grep -n 'GOOGLE_CLIENT_ID' .env; \
  pm2 restart ranking-api --env-production >/dev/null; sleep 3; \
  echo '--- health ---'; curl -s http://127.0.0.1:8765/api/health; \
  echo '--- public ---'; curl -sk https://ferramox.duckdns.org/ranking-api/api/health"
