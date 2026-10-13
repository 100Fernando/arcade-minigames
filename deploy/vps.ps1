# Ad-hoc VPS command runner — key auth, ZERO password prompts.
#
# Use this instead of raw `ssh root@51.79.39.178 ...` so the assistant can
# work on the VPS autonomously. BatchMode in ~/.ssh/config means it can never
# hang waiting for a password: if the key is missing it fails fast.
#
# Usage:
#   deploy\vps.ps1 "nginx -t; pm2 list"
#   deploy\vps.ps1 -s "nginx-api.conf"          # upload a local deploy\ file to /tmp/
#   echo "..." | deploy\vps.ps1                 # stdin is appended to the remote command

param(
  [string]$cmd = "",
  [Alias('s')][string]$upload = ""
)

$VPS = "ferramox-vps"   # alias in ~/.ssh/config -> root@51.79.39.178 (key auth)

if ($upload) {
  scp "deploy/$upload" "${VPS}:/tmp/"
  $base = ($upload -replace '\.sh$','')
  ssh $VPS "sed -i 's/\r$//' /tmp/$upload; chmod +x /tmp/$upload; bash /tmp/$upload"
  return
}

if (-not $cmd) { $cmd = ($input | Out-String) }
ssh $VPS $cmd
