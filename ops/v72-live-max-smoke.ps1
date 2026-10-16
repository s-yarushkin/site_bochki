# One owner-run diagnostic message; production SQLite is never opened by the test.
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Run=Join-Path $env:TEMP ('DachaPar-MAX-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Run | Out-Null
$Module=Join-Path $Run 'v72-live-max-smoke.mjs'
Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/s-yarushkin/site_bochki/$SourceSha/ops/v72-live-max-smoke.mjs" -OutFile $Module
& node --check $Module
if($LASTEXITCODE -ne 0){throw 'SMOKE_SYNTAX_FAILED'}
$Hash=(Get-FileHash -LiteralPath $Module -Algorithm SHA256).Hash.ToLowerInvariant()
$Remote='/tmp/dachapar-max-'+[guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 deploy@135.106.137.195 "umask 077 && mkdir '$Remote'"
if($LASTEXITCODE -ne 0){throw 'SSH_FAILED'}
& scp $Module "deploy@135.106.137.195:$Remote/smoke.mjs"
if($LASTEXITCODE -ne 0){throw 'SCP_FAILED'}
& ssh deploy@135.106.137.195 "cd '$Remote' && printf '%s  smoke.mjs\n' '$Hash' | sha256sum -c -"
if($LASTEXITCODE -ne 0){throw 'REMOTE_HASH_FAILED'}
Write-Host 'MAX_DIAGNOSTIC_MESSAGES=1; CLIENT_LEADS=0; INDEXING_UNCHANGED'
& ssh -t deploy@135.106.137.195 "sudo env NODE_EXTRA_CA_CERTS=/etc/design-zavod/ca/russian-trusted-ca-bundle.pem /usr/bin/node '$Remote/smoke.mjs'"
if($LASTEXITCODE -ne 0){throw 'LIVE_MAX_SMOKE_NOT_CONFIRMED; preserve output; do not rerun blindly'}
