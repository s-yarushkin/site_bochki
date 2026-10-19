# R9 ADS-01 production READ-ONLY inventory for owner-controlled Windows PowerShell.
# No sudo, uploads, restart, installation, MAX or production lead writes.
param([string]$Server = 'deploy@135.106.137.195')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Server -ne 'deploy@135.106.137.195') { throw 'UNEXPECTED_SERVER' }
Get-Command ssh -ErrorAction Stop | Out-Null
$Remote = @'
set -eu
WEB=/srv/sites/dachapar-preview/current
API=/srv/services/garant-bani-relay/current
DB=/var/lib/garant-bani-relay/leads.sqlite
echo 'ADS01_PREFLIGHT=READ_ONLY'
printf 'WEB_CURRENT='; readlink -f "$WEB" || true
printf 'API_CURRENT='; readlink -f "$API" || true
for pair in "$WEB/index.html" "$WEB/assets/js/app.js" "$WEB/assets/js/analytics.js" "$WEB/assets/js/analytics-config.js" "$WEB/privacy.html" "$API/server/garant-bani-relay.mjs" "$API/server/ads01-conversion.mjs" ; do
  if test -f "$pair"; then
    sha256sum "$pair"
  else
    echo "MISSING_FILE=$pair"
  fi
done
python3 - <<'PY'
import json
from pathlib import Path
for typ, path in [('WEB','/srv/sites/dachapar-preview/current'), ('API','/srv/services/garant-bani-relay/current')]:
    base=Path(path)
    p=base/'data/catalog-pricebook.json'
    try:
        data=json.loads(p.read_text(encoding='utf-8'))
        print(f'{typ}_PRICEBOOK_VERSION={data.get("version","unknown")}')
        print(f'{typ}_PRICE_SOURCE_COLUMN={data.get("priceSource",{}).get("column","unknown")}')
    except Exception as e:
        print(f'{typ}_PRICEBOOK_UNREADABLE={type(e).__name__}')
PY
if test -f "$DB"; then echo 'SQLITE_FILE_PRESENT=YES'; else echo 'SQLITE_FILE_PRESENT=NO_OR_INACCESSIBLE'; fi
printf 'RELAY_SERVICE='; systemctl is-active garant-bani-relay.service || true
printf 'PUBLIC_HTTPS_STATUS='; curl -sS -I --max-time 10 -o /dev/null -w '%{http_code}\n' https://xn--80aaan1dh9b.xn--p1ai/ || true
echo 'ADS01_PREFLIGHT_FINISHED=YES'
'@
Write-Host 'READ_ONLY=YES; SERVER_MUTATIONS=0; REAL_LEADS=0; MAX_CALLS=0'
$Remote | & ssh -T -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=10 $Server 'sh -s'
if ($LASTEXITCODE -ne 0) {
  throw ('ADS01_READ_ONLY_PREFLIGHT_SSH_STOPPED_EXIT_' + $LASTEXITCODE)
}
Write-Host 'ADS01_PREFLIGHT=PASS_READ_ONLY_COMMAND_EXECUTED; DEPLOY=NOT_PERFORMED'
