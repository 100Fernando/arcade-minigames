# ONE-TIME bootstrap: install our password-free key on the VPS.
#
# This is the ONLY time you ever type the root password, and you type it
# directly in the terminal (it never passes through the model, never gets
# stored in a file, never gets echoed).
#
# After this script prints "KEY AUTH OK", every other script in deploy\
# (and every ssh/scp call the assistant makes) authenticates with the key
# and asks for NO password at all.
#
# Usage:  deploy\vps-keypair.ps1

$ErrorStrict = $true

$KEY     = "$env:USERPROFILE\.ssh\id_vps_ferramox"
$VPS_HOST = "ferramox-vps"   # alias in ~/.ssh/config -> root@51.79.39.178

# 1) make sure the keypair exists (never overwrite an existing one)
if (-not (Test-Path $KEY)) {
  ssh-keygen -q -t ed25519 -N "" -f $KEY -C "vps-ferramox-deploy"
}

$pub = (Get-Content "$KEY.pub" -Raw).Trim()

# 2) ONE ssh call = ONE password prompt. The pubkey is piped on stdin (ssh reads
#    the password from the tty, so stdin still reaches the remote cat) — no
#    quoting of the key through PowerShell, which is what broke the first attempt.
Get-Content "$KEY.pub" |
  ssh -o "BatchMode=no" -o "PasswordAuthentication=yes" -o "PubkeyAuthentication=no" `
      -o ConnectTimeout=20 $VPS_HOST `
      "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys; cat >> ~/.ssh/authorized_keys; tail -n 1 ~/.ssh/authorized_keys; echo KEY_INSTALLED"

# 3) prove it: BatchMode=yes in ~/.ssh/config means NO prompt is possible,
#    so success here can only mean key auth worked.
ssh $VPS_HOST "echo KEY_AUTH_OK; uname -a; pm2 list 2>/dev/null | tail -n 4"
