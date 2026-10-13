# Deploy Phase 3 — Windows side: stage the files on the VPS and run deploy/vps-setup.sh.
# You will be asked for the root password TWICE (once for scp, once for ssh) — type it
# directly in the terminal; it never passes through the model.
#
# Usage:
#   deploy\run-vps-deploy.ps1
#   CERTBOT_EMAIL=you@example.com deploy\run-vps-deploy.ps1   # non-interactive certbot

$ErrorStrict = true
$VPS  = "root@51.79.39.178"

# 1) one scp call = one password prompt for all files
scp server.js bootstrap.sql package.json deploy/vps-setup.sh .env $VPS:/tmp/

# 2) one ssh call = one password prompt (sed strips any CRLF that Windows added)
ssh -t $VPS "sed -i 's/\r\$//' /tmp/vps-setup.sh; chmod +x /tmp/vps-setup.sh; bash /tmp/vps-setup.sh"
