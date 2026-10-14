# КВАДРО READY R1: strictly READ-ONLY host inventory before staging.
# No sudo, service restarts, config edits, database queries, MAX calls or production writes.
# Exact source already verified independently by QA at 2f86fbdffae240bff98b168f2942561abe9356cf.
[CmdletBinding()]
param(
  [string]$SshTarget='deploy@135.106.137.195'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($SshTarget -notmatch '^[a-z_][a-z0-9_-]{0,31}@[a-zA-Z0-9.-]+$'){
  throw 'QUADRO_INVALID_SSH_TARGET'
}
if(!(Get-Command ssh -ErrorAction SilentlyContinue)){throw 'QUADRO_OPENSSH_MISSING'}
$RemoteProbe=@'
set -eu
printf 'QUADRO_R1_REMOTE_MODE=READ_ONLY\n'
printf 'REMOTE_UTC='
date -u +%FT%TZ
printf 'HOST='
hostname
printf 'NODE_VERSION='
if command -v node >/dev/null 2>&1; then node --version; else echo MISSING; fi
printf 'CADDY_VERSION='
if command -v caddy >/dev/null 2>&1; then caddy version | head -1; else echo MISSING; fi
echo '=== SYSTEMD_UNITS ==='
for unit in garant-bani-relay.service caddy.service; do
  echo "UNIT=$unit"
  systemctl show "$unit" --no-pager \
    -p LoadState -p ActiveState -p SubState -p User -p WorkingDirectory -p FragmentPath 2>/dev/null || true
done
echo '=== LISTENER_3301 ==='
if command -v ss >/dev/null 2>&1; then
  ss -ltn '( sport = :3301 )' | tail -3
else
  echo SS_NOT_INSTALLED
fi
echo '=== STATIC_CURRENT_PATH ==='
if [ -L /srv/sites/garant-bani-preview/current ]; then
  printf 'STATIC_CURRENT='
  readlink -f /srv/sites/garant-bani-preview/current || true
elif [ -d /srv/sites/garant-bani-preview/current ]; then
  echo 'STATIC_CURRENT=DIRECTORY_NOT_SYMLINK'
else
  echo 'STATIC_CURRENT=NOT_FOUND'
fi
echo '=== BACKEND_LAYOUT ==='
for path in /opt/garant-bani-relay /srv/garant-bani-relay /var/lib/garant-bani-relay /var/lib/garant-bani-relay/leads.sqlite; do
  if [ -d "$path" ]; then
    printf '%s=DIR\n' "$path"
  elif [ -f "$path" ]; then
    printf '%s=FILE\n' "$path"
  else
    printf '%s=NOT_ACCESSIBLE_OR_ABSENT\n' "$path"
  fi
done
echo '=== CADDY_CONFIG_FINGERPRINT ==='
if [ -r /etc/caddy/Caddyfile ]; then
  printf 'CADDY_CONFIG_SHA256='
  sha256sum /etc/caddy/Caddyfile | cut -d' ' -f1
else
  echo 'CADDY_CONFIG_SHA256=NOT_READABLE'
fi
echo '=== DISK ==='
df -h /srv | tail -1
echo '=== EXISTING_HTTPS_STATUS_ONLY ==='
if command -v curl >/dev/null 2>&1; then
  for relative in /bani-preview/ /bani-preview/manager.html /bani-preview/api/manager/session; do
    code=$(curl -sS -m 12 -o /dev/null -w '%{http_code}' "https://xn----7sbbigeqcfm8bq.xn--p1ai$relative") || code="CURL_FAILED"
    printf 'PREVIEW_HTTP %s %s\n' "$relative" "$code"
  done
else
  echo 'CURL_NOT_AVAILABLE'
fi
echo 'QUADRO_R1_REMOTE_WRITES=0'
echo 'QUADRO_R1_DONE=1'
'@
Write-Host 'QUADRO_R1_LOCAL_MODE=READ_ONLY'
Write-Host ('QUADRO_R1_TARGET='+$SshTarget)
$RemoteProbe | & ssh -T -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes $SshTarget 'bash -s'
if($LASTEXITCODE -ne 0){throw ('QUADRO_R1_SSH_FAILED_'+$LASTEXITCODE)}
Write-Host 'QUADRO_R1_PREFLIGHT=PASS'
Write-Host 'SERVER_CHANGES=0'
