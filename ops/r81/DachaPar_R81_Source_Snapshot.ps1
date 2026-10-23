# Dacha Par R8.1 — read-only snapshot of the exact live WEB release.
# FIX1: encodes the Bash payload before SSH so that Windows ssh cannot break embedded quotes.
# Server writes only one protected temporary .tgz; no changes to live WEB/API/SQLite/MAX.
param(
  [string]$Destination = (Join-Path $env:USERPROFILE 'Downloads\DachaPar_R81_Live_Source_20261023.tgz')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Remote = 'deploy@135.106.137.195'
$Expected = '/srv/sites/dachapar-preview/releases/CJM-R80-20261022-1792731611547801280'
$SshOptions = @('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
$Temp = '/tmp/dachapar-r81-source-' + [guid]::NewGuid().ToString('N') + '.tgz'

# Public WEB files only; never include API, manager accounts, database, .env, uploads or private data.
$Paths = @(
  'index.html','app.mjs','quote.mjs','lead-client.mjs','analytics-runtime.mjs',
  'bani/index.html','bani/kvadro/index.html','bani/parus/index.html',
  'bani/viking/index.html','bani/kvadro-haus/index.html',
  'raboty/index.html','compare/index.html','voprosy/index.html','kontakty/index.html',
  'dostavka-i-ustanovka/index.html','journal/index.html',
  'data/catalog-pricebook.json','data/pricebook.js',
  'cjm-r80.css','cjm-r80-model.mjs','sitemap.xml','robots.txt',
  'styles.css','premium.css','contrast-r3.css','experience-r4.css','journey-r5.css',
  'choice-r7.css','r731-supplement.css','r732-content.css',
  'phone-mask.mjs','motion.mjs','journey.mjs','r731-finish-picker.mjs',
  'contact-v2.css','contact-v2.js','parus-media/content.mjs',
  'parus-media/widget.mjs','parus-media/widget.css',
  'qh-media/content.mjs','qh-media/widget.mjs','qh-media/widget.css',
  'assets/vendor/scrollcraft.js','assets/vendor/scrollcraft.css'
)
$PathsArgument = $Paths -join ' '

$Bash = @'
set -euo pipefail
live=$(readlink -f /srv/sites/dachapar-preview/current)
expected='__EXPECTED__'
if [[ "$live" != "$expected" ]]; then
  printf 'R81_SOURCE_DRIFT_ACTUAL=%s\n' "$live"
  exit 4
fi
cd "$expected"
for p in index.html app.mjs quote.mjs lead-client.mjs bani/index.html bani/kvadro/index.html bani/parus/index.html bani/viking/index.html bani/kvadro-haus/index.html cjm-r80-model.mjs; do
  if [[ ! -f "$p" ]]; then printf 'R81_REQUIRED_FILE_MISSING=%s\n' "$p"; exit 5; fi
done
files=()
for p in __PATHS__; do
  if [[ -f "$p" ]]; then
    files+=("$p")
  else
    printf 'R81_OPTIONAL_FILE_MISSING=%s\n' "$p"
  fi
done
shopt -s nullglob
for p in journal/*/index.html parus-media/assets/plans/*.svg qh-media/assets/plans/*.svg; do
  [[ -f "$p" ]] && files+=("$p")
done
if (( ${#files[@]} == 0 )); then echo R81_EMPTY_PUBLIC_SNAPSHOT; exit 6; fi
umask 077
tar -czf '__TEMP__' -- "${files[@]}"
chmod 600 '__TEMP__'
sha256sum '__TEMP__'
printf 'R81_SOURCE_FILE_COUNT=%s\n' "${#files[@]}"
echo R81_SOURCE_SNAPSHOT_READY
'@
$Bash = $Bash.Replace('__EXPECTED__',$Expected).Replace('__TEMP__',$Temp).Replace('__PATHS__',$PathsArgument)
# Important: the SSH remote command contains ONLY shell-safe ASCII and base64 data.
# The Bash program itself never goes through Windows OpenSSH argument quote rewriting.
$Encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Bash))
$RemoteCommand = 'echo ' + $Encoded + ' | base64 -d | bash'

foreach ($program in @('ssh','scp')) { Get-Command $program -ErrorAction Stop | Out-Null }
$DestinationDir = Split-Path -Path $Destination -Parent
if (-not (Test-Path -LiteralPath $DestinationDir -PathType Container)) {
  throw "R81_DESTINATION_DIR_MISSING=$DestinationDir"
}
$RemoteStarted = $false
try {
  Write-Host "R81_EXPECTED_LIVE=$Expected; READ_ONLY_PRODUCTION=YES; SSH_PAYLOAD_ENCODING=BASE64"
  $RemoteStarted = $true
  $Result = @(& ssh @SshOptions $Remote $RemoteCommand)
  $SshExit = $LASTEXITCODE
  $Result | ForEach-Object { Write-Host $_ }
  if ($SshExit -ne 0) { throw 'R81_SNAPSHOT_SOURCE_DRIFT_OR_READ_FAILURE; PUBLIC_WEB_UNCHANGED' }
  if (-not ($Result -contains 'R81_SOURCE_SNAPSHOT_READY')) { throw 'R81_REMOTE_ARCHIVE_NOT_CONFIRMED' }
  $HashLines = @($Result | Where-Object { $_ -match '^[a-f0-9]{64}\s+' })
  if ($HashLines.Count -ne 1) { throw 'R81_REMOTE_SHA256_MISSING_OR_AMBIGUOUS' }
  $RemoteHash = ($HashLines[0] -split '\s+')[0].ToLowerInvariant()
  & scp @SshOptions ("{0}:{1}" -f $Remote,$Temp) $Destination
  if ($LASTEXITCODE -ne 0) { throw 'R81_SNAPSHOT_TRANSFER_FAILED' }
  $LocalHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($LocalHash -ne $RemoteHash) { throw "R81_SNAPSHOT_HASH_MISMATCH; LOCAL=$LocalHash; REMOTE=$RemoteHash" }
  Write-Host "R81_SOURCE_SNAPSHOT=PASS; SHA256=$LocalHash; OUTPUT=$Destination; PRODUCTION_WRITES=0"
} finally {
  if ($RemoteStarted) {
    # Temp archive is outside the WEB release, with mode 0600. Cleanup is best effort.
    & ssh @SshOptions $Remote ("rm -f -- {0}" -f $Temp) 2>$null | Out-Null
  }
}
