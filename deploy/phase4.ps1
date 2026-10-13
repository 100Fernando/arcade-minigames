# Phase 4 — wire the Google OAuth client id EVERYWHERE, in one shot.
#
# The client id is PUBLIC (Google ships it in HTML/JS by design), so passing it
# as an argument is safe. It must be the SAME value in three places, or the
# server's `aud` check rejects every login:
#   1) index.html  data-client-id="..."   (browser One Tap, served by Pages)
#   2) local .env  GOOGLE_CLIENT_ID = ... (local `node server.js` dev)
#   3) VPS .env    GOOGLE_CLIENT_ID = ... (the live server, /opt/ranking-api)
#
# Usage:
#   deploy\phase4.ps1 1234-abc.apps.googleusercontent.com   # wire all three
#   deploy\phase4.ps1 1234-abc.apps.googleusercontent.com -push
#        ^ also commits + pushes index.html so Pages rebuilds with the new id
#   deploy\phase4.ps1 -show                                # print current state only

param(
  [Parameter(Position = 0)][string]$clientId = "",
  [switch]$push,
  [switch]$show
)

$VPS = "ferramox-vps"

function Show-State {
  Write-Host "--- index.html data-client-id ---"
  Select-String -Path index.html -Pattern 'data-client-id' | ForEach-Object { $_.Line.Trim() }
  Write-Host "--- local .env ---"
  (Select-String -Path .env -Pattern 'GOOGLE_CLIENT_ID' | ForEach-Object { $_.Line.Trim() }) -join "`n"
  Write-Host "--- VPS .env + health ---"
  ssh $VPS "grep -n GOOGLE_CLIENT_ID /opt/ranking-api/.env 2>/dev/null || echo '(not set)'; curl -s http://127.0.0.1:8765/api/health"
  Write-Host "--- public health ---"
  curl.exe -sk https://ferramox.duckdns.org/ranking-api/api/health
}

if ($show -or (-not $clientId)) { Show-State; if ($show) { exit 0 } }

if ($clientId -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') {
  Write-Host "WARN: '$clientId' does not look like a Web OAuth client id (expected *.apps.googleusercontent.com)"
  Write-Host "      refusing - re-run with the value from Cloud Console."
  exit 1
}

# 1) index.html — the browser side (git-tracked, served by Pages)
$idx = Get-Content index.html -Raw
if ($idx -notmatch 'data-client-id="[^"]*"') {
  Write-Host "index.html has no data-client-id attribute - aborting"; exit 1
}
$idx2 = $idx -replace 'data-client-id="[^"]*"', "data-client-id=`"$clientId`""
if ($idx -eq $idx2) { Write-Host "index.html already set" } else { Set-Content -Path index.html -Value $idx2 -NoNewline; Write-Host "index.html: data-client-id set" }

# 2) local .env — dev server side
$env1 = Get-Content .env -Raw
if ($env1 -match '(?m)^GOOGLE_CLIENT_ID\s*=') {
  $env2 = $env1 -replace '(?m)^GOOGLE_CLIENT_ID\s*=.*', "GOOGLE_CLIENT_ID = $clientId"
} else {
  $env2 = $env1.TrimEnd() + "`r`nGOOGLE_CLIENT_ID = $clientId`r`n"
}
Set-Content -Path .env -Value $env2 -NoNewline
Write-Host ".env: GOOGLE_CLIENT_ID set (gitignored)"

# 3) VPS .env + pm2 restart + prove the flip.
# NOTE: keep the remote command on ONE line. PowerShell backtick line-continuation
# inside a CRLF file leaves a literal \r in the string, which bash reports as
# `$'\r': command not found` (harmless, but noisy).
ssh $VPS "cd /opt/ranking-api && cp .env .env.pre-client; grep -q '^GOOGLE_CLIENT_ID' .env && sed -i 's|^GOOGLE_CLIENT_ID.*|GOOGLE_CLIENT_ID = $clientId|' .env || printf '\nGOOGLE_CLIENT_ID = %s\n' '$clientId' >> .env; chmod 600 .env; grep -n GOOGLE_CLIENT_ID .env; pm2 restart ranking-api; sleep 3; echo '--- upstream health ---'; curl -s http://127.0.0.1:8765/api/health; echo; echo '--- public health ---'; curl -sk https://ferramox.duckdns.org/ranking-api/api/health; echo"

if ($push) {
  git add index.html
  git commit -q -m "Phase 4: Google One Tap client id wired (data-client-id)"
  git push -q origin main
  Write-Host "pushed - Pages rebuilds; allow ~1 min, then hard-refresh the Pages tab"
}

Write-Host ""
Write-Host "NEXT (user-side, cannot be automated): the OAuth Client (Web) in Google Cloud"
Write-Host "Console must list these Authorized JavaScript origins:"
Write-Host "  https://100fernando.github.io"
Write-Host "  https://ferramox.duckdns.org"
Write-Host "  http://localhost:8765"
Show-State
