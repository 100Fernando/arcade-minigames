# Deploy the arcade frontend to the VPS at the subpath /arcade/ (same domain as the
# wedding app). Key-only SSH (no password prompts): ~/.ssh/config pins ferramox-vps to
# IdentityFile ~/.ssh/id_vps_ferramox + BatchMode yes. If this ever prints "Permission
# denied", the key install was lost -> re-run deploy\vps-keypair.ps1 (the ONLY script
# that needs the root password, and only the first time).
#
# What it does:
#   1) mkdir /var/www/arcade on the VPS
#   2) scp the 7 static frontend files there (CRLF stripped so browsers get clean LF)
#   3) scp + run deploy\vps-arcade.sh (nginx location ^~ /arcade/ + COOP header)
#
# Usage:
#   deploy\deploy-arcade.ps1            # push current files + wire nginx
#   deploy\deploy-arcade.ps1 -show      # just print the live /arcade/ + COOP state

param([switch]$show)

$ErrorStrict = $true
$VPS = "ferramox-vps"   # alias -> root@51.79.39.178 (key auth)
$WEBROOT = "/var/www/arcade"
$FILES = @("index.html","styles.css","script.js","ranking.js","audio.js","aventura-mobile.js","mp-client.js")

if ($show) {
  ssh $VPS "curl -sk -m 10 -o /dev/null -w 'arcade=%{http_code}\n' https://ferramox.duckdns.org/arcade/; curl -sk -m 10 -D - -o /dev/null https://ferramox.duckdns.org/arcade/ | grep -i cross-origin-opener-policy; ls -1 $WEBROOT"
  return
}

# 1) ensure the webroot exists before scp'ing into it
ssh $VPS "mkdir -p $WEBROOT"

# 2) upload each frontend file, then strip any CRLF Windows added (browsers tolerate
#    it, but keep the served bytes identical to the repo for SHA comparisons)
foreach ($f in $FILES) {
  scp "$f" "${VPS}:$WEBROOT/"
  ssh $VPS "sed -i 's/\r\$//' $WEBROOT/$f"
}

# 3) stage + run the nginx finale
scp "deploy/vps-arcade.sh" "${VPS}:/tmp/"
ssh -t $VPS "sed -i 's/\r\$//' /tmp/vps-arcade.sh; chmod +x /tmp/vps-arcade.sh; bash /tmp/vps-arcade.sh"
