# Pinned preview cutover. No Actions, no permanent redirect, no production test leads.
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha,
 [string]$Server='deploy@135.106.137.195'
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($Server -ne 'deploy@135.106.137.195'){throw 'UNEXPECTED_SERVER'}
foreach($Tool in @('git','node','npm','tar','ssh','scp')){Get-Command $Tool -ErrorAction Stop | Out-Null}
$Major=[int](((& node --version).Trim() -replace '^v','').Split('.')[0])
if($Major -lt 24){throw 'NODE24_REQUIRED'}
$Run=Join-Path $env:TEMP ('DachaPar-V72-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Run | Out-Null
$Repo=Join-Path $Run 'repo'
& git clone --no-checkout https://github.com/s-yarushkin/site_bochki.git $Repo
if($LASTEXITCODE -ne 0){throw 'GIT_CLONE_FAILED'}
& git -C $Repo checkout --detach $SourceSha
if($LASTEXITCODE -ne 0){throw 'EXACT_CHECKOUT_FAILED'}
$Actual=(& git -C $Repo rev-parse HEAD).Trim()
if($Actual -ne $SourceSha){throw 'SOURCE_SHA_MISMATCH'}
Push-Location $Repo
try{
 & npm.cmd run check
 if($LASTEXITCODE -ne 0){throw 'NODE_CHECKS_FAILED'}
}finally{Pop-Location}
$Archive=Join-Path $Run 'source.tar'
$Source=Join-Path $Run 'source'
New-Item -ItemType Directory -Path $Source | Out-Null
& git -C $Repo archive --format=tar --output=$Archive $SourceSha
if($LASTEXITCODE -ne 0){throw 'GIT_ARCHIVE_FAILED'}
& tar -xf $Archive -C $Source
if($LASTEXITCODE -ne 0){throw 'SOURCE_EXTRACT_FAILED'}
& node (Join-Path $Source 'ops/v72-source-manifest.mjs') $Source $SourceSha
if($LASTEXITCODE -ne 0){throw 'MANIFEST_FAILED'}
$Package=Join-Path $Run 'dachapar-source.tar.gz'
& tar -czf $Package -C $Source .
if($LASTEXITCODE -ne 0){throw 'PACKAGE_FAILED'}
$Hash=(Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant()
$Remote='/tmp/dachapar-v72-'+[guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 $Server "umask 077 && mkdir '$Remote'"
if($LASTEXITCODE -ne 0){throw 'SSH_STAGE_FAILED'}
& scp $Package "${Server}:$Remote/source.tar.gz"
if($LASTEXITCODE -ne 0){throw 'SCP_FAILED'}
$Prepare="cd '$Remote' && printf '%s  source.tar.gz\n' '$Hash' | sha256sum -c - && mkdir source && tar -xzf source.tar.gz -C source"
& ssh -o ConnectTimeout=15 $Server $Prepare
if($LASTEXITCODE -ne 0){throw 'REMOTE_PACKAGE_VERIFY_FAILED'}
# Interactive TTY is intentional: only the owner enters sudo if required.
& ssh -t -o ConnectTimeout=15 $Server "sudo python3 '$Remote/source/ops/v72-domain-install.py' --source '$Remote/source' --source-sha '$SourceSha' --apply"
if($LASTEXITCODE -ne 0){throw 'SERVER_INSTALL_STOPPED; inspect exact fail-closed reason; do not bypass baseline'}
Write-Host ('V72_SOURCE_SHA='+$SourceSha)
Write-Host 'V72_HTTPS_PREVIEW_INSTALLED=YES'
# This browser test intercepts every form POST; it does not create working leads.
$env:DACHA_QA_BASE='https://xn--80aaan1dh9b.xn--p1ai/'
try{
 & py -3 (Join-Path $Source 'tests/browser_v66_smoke.py')
 if($LASTEXITCODE -ne 0){throw 'LIVE_BROWSER_QA_PENDING_OR_FAILED; HTTPS preview installed; keep noindex'}
}finally{Remove-Item Env:DACHA_QA_BASE -ErrorAction SilentlyContinue}
Write-Host 'V72_LIVE_BROWSER_QA=PASS_7_VIEWPORTS'
Write-Host 'REAL_MAX_DELIVERY=NOT_TESTED; COMMERCIAL_GO=NO'
