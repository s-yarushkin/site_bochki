# R8.1 read-only source snapshot. No website, database, API or git changes.
param([string]$Destination=(Join-Path $env:USERPROFILE 'Downloads\DachaPar_R81_Live_Source_20261023.tgz'))
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$Remote='deploy@135.106.137.195'
$Expected='/srv/sites/dachapar-preview/releases/CJM-R80-20261022-1792731611547801280'
$SshOptions=@('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
$Temp='/tmp/dachapar-r81-source-'+[guid]::NewGuid().ToString('N')+'.tgz'
# Only public WEB content (text/code); deliberately exclude manager secrets, server, SQLite and uploads.
$Paths=@('index.html','app.mjs','quote.mjs','lead-client.mjs','analytics-runtime.mjs',
  'bani/index.html','bani/kvadro/index.html','bani/parus/index.html',
  'bani/viking/index.html','bani/kvadro-haus/index.html',
  'raboty/index.html','compare/index.html','voprosy/index.html','kontakty/index.html',
  'dostavka-i-ustanovka/index.html','journal/index.html',
  'data/catalog-pricebook.json','data/pricebook.js',
  'cjm-r80.css','cjm-r80-model.mjs', 'sitemap.xml','robots.txt')
$PathArgs=($Paths -join ' ')
$Script=@'
set -eu
live=$(readlink -f /srv/sites/dachapar-preview/current)
if [ "$live" != "__EXPECTED__" ]; then
  echo "R81_SOURCE_DRIFT_ACTUAL=$live"
  exit 4
fi
cd "__EXPECTED__"
files=""
for p in __PATHS__; do
  if [ -f "$p" ]; then files="$files $p"; fi
done
for p in journal/*/index.html; do
  if [ -f "$p" ]; then files="$files $p"; fi
done
if [ -z "$files" ]; then echo R81_EMPTY_PUBLIC_SNAPSHOT; exit 5; fi
tar -czf "__TEMP__" $files
chmod 600 "__TEMP__"
sha256sum "__TEMP__"
echo R81_SOURCE_SNAPSHOT_READY
'@
$Script=$Script.Replace('__EXPECTED__',$Expected).Replace('__TEMP__',$Temp).Replace('__PATHS__',$PathArgs)

try {
  Write-Host "R81_EXPECTED_LIVE=$Expected; READ_ONLY_PRODUCTION=YES"
  & ssh @SshOptions $Remote $Script
  if ($LASTEXITCODE -ne 0) { throw 'R81_SNAPSHOT_SOURCE_DRIFT_OR_READ_FAILURE' }
  & scp @SshOptions ("{0}:{1}" -f $Remote,$Temp) $Destination
  if ($LASTEXITCODE -ne 0) { throw 'R81_SNAPSHOT_TRANSFER_FAILED' }
  $hash=(Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "R81_SOURCE_SNAPSHOT=PASS; SHA256=$hash; OUTPUT=$Destination; PRODUCTION_WRITES=0"
} finally {
  & ssh @SshOptions $Remote "rm -f '$Temp'" 2>$null | Out-Null
}
