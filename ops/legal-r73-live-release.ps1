# DachaPar R73 LEGAL - exact owner-provided live source, WEB+API atomic overlay.
# No direct edits to SQLite, MAX, manager auth, Caddy or published journal.
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
foreach($tool in @('git','node','npm','py','ssh','scp')){
  Get-Command $tool -ErrorAction Stop | Out-Null
}
$Branch='fix/r7-legal-analytics-20261021'
$Server='deploy@135.106.137.195'
$Run=Join-Path $env:TEMP ('DachaPar-R73-Legal-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $Run | Out-Null
$Repo=Join-Path $Run 'repo'
Write-Host 'R73_LEGAL_START=YES; ACTIVE_SITE_UNCHANGED_UNTIL_PREFLIGHT'
& git -c core.autocrlf=false clone --quiet --depth 1 --single-branch --branch $Branch https://github.com/s-yarushkin/site_bochki.git $Repo
if($LASTEXITCODE -ne 0){throw 'GIT_CLONE_FAILED'}
$Actual=(& git -C $Repo rev-parse HEAD).Trim()
if($Actual -ne $SourceSha){throw "GIT_PIN_MISMATCH_EXPECTED_$($SourceSha)_GOT_$Actual"}
Push-Location $Repo
try{
  & npm.cmd run check
  if($LASTEXITCODE -ne 0){throw 'NODE_TESTS_FAILED'}
  & node scripts/verify-v74-public-prices.mjs
  if($LASTEXITCODE -ne 0){throw 'PRICE_CONTRACT_FAILED'}
  & py -3 -X utf8 tests/test_legal_overlay.py
  if($LASTEXITCODE -ne 0){throw 'CRLF_API_PATCH_TEST_FAILED'}
  & py -3 -X utf8 tests/test_legal_r73_live.py
  if($LASTEXITCODE -ne 0){throw 'R73_FORM_PATCH_TEST_FAILED'}
}finally{Pop-Location}
$Archive=Join-Path $Run 'r73-legal-source.tar.gz'
& git -C $Repo -c core.autocrlf=false archive --format=tar.gz "--output=$Archive" $SourceSha
if($LASTEXITCODE -ne 0){throw 'ARCHIVE_FAILED'}
$Hash=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
$Remote='/tmp/dachapar-r73-legal-'+[guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 $Server "umask 077 && mkdir -m 700 '$Remote'"
if($LASTEXITCODE -ne 0){throw 'REMOTE_STAGING_FAILED'}
& scp $Archive ("{0}:{1}/source.tar.gz" -f $Server,$Remote)
if($LASTEXITCODE -ne 0){throw 'SCP_FAILED'}
& ssh -o ConnectTimeout=15 $Server "cd '$Remote' && printf '%s  source.tar.gz\n' '$Hash' | sha256sum -c - && mkdir -m 700 source && tar -xzf source.tar.gz -C source"
if($LASTEXITCODE -ne 0){throw 'REMOTE_ARCHIVE_HASH_FAILED'}
Write-Host 'R73_LEGAL_REMOTE_PREFLIGHT_START; NO_SUDO_WRITES_DURING_PREFLIGHT'
& ssh -tt -o ConnectTimeout=15 $Server "sudo python3 '$Remote/source/ops/legal-r73-live-install.py' --source '$Remote/source' --source-sha '$SourceSha'"
if($LASTEXITCODE -ne 0){throw 'REMOTE_PREFLIGHT_FAILED_NO_DEPLOY'}
Write-Host 'R73_LEGAL_PREFLIGHT=PASS; STAGING_NEW_CURRENT_RELEASE'
& ssh -tt -o ConnectTimeout=15 $Server "sudo python3 '$Remote/source/ops/legal-r73-live-install.py' --source '$Remote/source' --source-sha '$SourceSha' --activate"
if($LASTEXITCODE -ne 0){throw 'R73_LEGAL_DEPLOY_ABORT_CHECK_LOG_DO_NOT_BLIND_RETRY'}
Write-Host ('R73_LEGAL_SOURCE_SHA='+$SourceSha)
Write-Host 'R73_LEGAL_OWNER_RUN=PASS; SQLITE=UNTOUCHED; MAX_TEST_CALLS=0'
Write-Host ('LOCAL_EVIDENCE='+$Run)
