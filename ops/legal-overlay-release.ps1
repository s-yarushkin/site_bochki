# Narrow legal deployment to CURRENT DachaPar website & API (preserves R73).
# Never uploads, opens, modifies or deletes the production SQLite database.
param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^[a-f0-9]{40}$')]
  [string]$SourceSha
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
foreach($name in @('git','node','npm','py','ssh','scp')) {
  Get-Command $name -ErrorAction Stop | Out-Null
}
$Server='deploy@135.106.137.195'
$RepoURL='https://github.com/s-yarushkin/site_bochki.git'
$Branch='fix/r7-legal-analytics-20261021'
$Run=Join-Path $env:TEMP ('DachaPar-Legal-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $Run | Out-Null
$Repo=Join-Path $Run 'repo'
Write-Host 'LEGAL_OWNER_RUN=START; ADS_SPEND=UNTOUCHED; SQLITE=UNTOUCHED; MAX=NO_LIVE_CALLS'
& git clone --quiet --depth 1 --single-branch --branch $Branch $RepoURL $Repo
if($LASTEXITCODE -ne 0){throw 'GIT_CLONE_FAILED'}
& git -C $Repo config core.autocrlf false
$Actual=(& git -C $Repo rev-parse HEAD).Trim()
if($Actual -ne $SourceSha){throw "PINNED_SHA_MISMATCH_EXPECTED_$($SourceSha)_GOT_$Actual"}
Push-Location $Repo
try {
  & npm.cmd run check
  if($LASTEXITCODE -ne 0){throw 'LOCAL_NODE_CHECK_FAILED'}
  & node scripts/verify-v74-public-prices.mjs
  if($LASTEXITCODE -ne 0){throw 'LOCAL_PRICE_CHECK_FAILED'}
  & py -3 -X utf8 tests/test_legal_overlay.py
  if($LASTEXITCODE -ne 0){throw 'LOCAL_LEGAL_OVERLAY_CHECK_FAILED'}
} finally {
  Pop-Location
}
$Archive=Join-Path $Run 'legal-source.tar.gz'
& git -C $Repo -c core.autocrlf=false archive --format=tar.gz "--output=$Archive" $SourceSha
if($LASTEXITCODE -ne 0){throw 'SOURCE_ARCHIVE_FAILED'}
$Hash=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
$Remote='/tmp/dachapar-legal-'+[guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 $Server "umask 077 && mkdir -m 700 '$Remote'"
if($LASTEXITCODE -ne 0){throw 'SSH_STAGING_FAILED'}
& scp $Archive ("{0}:{1}/legal-source.tar.gz" -f $Server,$Remote)
if($LASTEXITCODE -ne 0){throw 'UPLOAD_FAILED'}
$Prepare="cd '$Remote' && printf '%s  legal-source.tar.gz\n' '$Hash' | sha256sum -c - && mkdir -m700 source && tar -xzf legal-source.tar.gz -C source"
& ssh -o ConnectTimeout=15 $Server $Prepare
if($LASTEXITCODE -ne 0){throw 'REMOTE_SHA_OR_EXTRACTION_FAILED'}
Write-Host 'LEGAL_RELEASE_REMOTE_PREFLIGHT_START; NO_SERVER_WRITES_EXPECTED'
& ssh -tt -o ConnectTimeout=15 $Server "sudo python3 '$Remote/source/ops/legal-overlay-install.py' --source '$Remote/source' --source-sha '$SourceSha'"
if($LASTEXITCODE -ne 0){throw 'PRECHECK_FAILED_NO_DEPLOY'}
Write-Host 'LEGAL_RELEASE_PREFLIGHT=PASS; ENTER_EXISTING_SUDO_PASSWORD_FOR_ATOMIC_RELEASE'
& ssh -tt -o ConnectTimeout=15 $Server "sudo python3 '$Remote/source/ops/legal-overlay-install.py' --source '$Remote/source' --source-sha '$SourceSha' --activate"
if($LASTEXITCODE -ne 0){throw 'RELEASE_ABORTED_CHECK_SERVER_OUTPUT_NO_BLIND_RETRY'}
Write-Host ('LEGAL_RELEASE_SHA='+$SourceSha)
Write-Host 'LEGAL_RELEASE=PASS; ACTIVE_SERVER_LOCAL_CONTENT=PRESERVED; SQLite=UNTOUCHED; MAX_CALLS=0'
Write-Host ('LOCAL_EVIDENCE='+$Run)
