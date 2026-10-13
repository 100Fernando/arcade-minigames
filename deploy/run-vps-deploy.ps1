# Deploy Phase 3 — Windows side: stage ONE script on the VPS and run it.
# You will be asked for the root password TWICE (once for scp, once for ssh) — type it
# directly in the terminal; it never passes through the model.
#
# Usage:
#   deploy\run-vps-deploy.ps1                 # runs the newest fix (vps-fix2.sh)
#   deploy\run-vps-deploy.ps1 vps-fix.sh      # run a specific script from deploy\

param([string]$script = "vps-fix2.sh")

$ErrorStrict = $true
$VPS  = "root@51.79.39.178"

# 1) one scp call = one password prompt for all files
scp "deploy/$script" "${VPS}:/tmp/"

# 2) one ssh call = one password prompt (sed strips any CRLF that Windows added)
ssh -t $VPS "sed -i 's/\r\$//' /tmp/$script; chmod +x /tmp/$script; bash /tmp/$script"
