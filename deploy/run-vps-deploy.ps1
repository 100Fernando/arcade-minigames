# Deploy Phase 3 — Windows side: stage ONE script on the VPS and run it.
#
# NO PASSWORD IS ASKED. ~/.ssh/config pins 51.79.39.178 to key-only auth
# (IdentityFile ~/.ssh/id_vps_ferramox + BatchMode yes). If this script ever
# prints "Permission denied", the key install was lost — re-run deploy\vps-keypair.ps1
# (that is the ONLY script that needs the root password, and only the first time).
#
# Usage:
#   deploy\run-vps-deploy.ps1                 # runs the finale (vps-ssl.sh)
#   deploy\run-vps-deploy.ps1 vps-ssl.sh      # run a specific script from deploy\
#
# Superseded (kept for history, do not re-run): vps-setup.sh vps-fix.sh vps-fix2.sh
# vps-fix3.sh vps-fix4.sh. Current chain: vps-keypair.ps1 (one-time) -> vps.ps1 / vps-ssl.sh.

param([string]$script = "vps-ssl.sh")

$ErrorStrict = $true
$VPS  = "ferramox-vps"   # alias in ~/.ssh/config -> root@51.79.39.178 (key auth)

# 1) one scp call = zero password prompts
scp "deploy/$script" "${VPS}:/tmp/"

# 2) one ssh call = zero password prompts (sed strips any CRLF that Windows added)
ssh -t $VPS "sed -i 's/\r$//' /tmp/$script; chmod +x /tmp/$script; bash /tmp/$script"
