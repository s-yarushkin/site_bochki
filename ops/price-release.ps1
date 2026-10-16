param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
foreach($Tool in @('git','node','npm','py','tar','ssh','scp')){Get-Command $Tool -ErrorAction Stop | Out-Null}
$Run=Join-Path $env:TEMP ('DachaPar-Prices-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Run | Out-Null
$Repo=Join-Path $Run 'repo'
& git clone --no-checkout https://github.com/s-yarushkin/site_bochki.git $Repo
if($LASTEXITCODE -ne 0){throw 'CLONE_FAILED'}
& git -C $Repo config core.autocrlf false
& git -C $Repo checkout --detach $SourceSha
if($LASTEXITCODE -ne 0 -or (& git -C $Repo rev-parse HEAD).Trim() -ne $SourceSha){throw 'EXACT_CHECKOUT_FAILED'}
Push-Location $Repo
try{
 & npm.cmd run check
 if($LASTEXITCODE -ne 0){throw 'NODE_CHECKS_FAILED'}
 & py -3 tests/browser_manager_entry.py
 if($LASTEXITCODE -ne 0){throw 'LOCAL_MANAGER_CTA_QA_FAILED'}
 & py -3 tests/browser_search_smoke.py
 if($LASTEXITCODE -ne 0){throw 'LOCAL_SEARCH_BROWSER_QA_FAILED'}
 & py -3 tests/browser_v66_smoke.py
 if($LASTEXITCODE -ne 0){throw 'LOCAL_PRODUCT_BROWSER_QA_FAILED'}
}finally{Pop-Location}
$Source=Join-Path $Run 'source'
New-Item -ItemType Directory -Path $Source | Out-Null
$Tar=Join-Path $Run 'source.tar'
& git -C $Repo -c core.autocrlf=false archive --format=tar --output=$Tar $SourceSha
if($LASTEXITCODE -ne 0){throw 'ARCHIVE_FAILED'}
& tar -xf $Tar -C $Source
if($LASTEXITCODE -ne 0){throw 'EXTRACT_FAILED'}
& node (Join-Path $Source 'ops/v72-source-manifest.mjs') $Source $SourceSha
if($LASTEXITCODE -ne 0){throw 'MANIFEST_FAILED'}
$Package=Join-Path $Run 'prices-source.tar.gz'
& tar -czf $Package -C $Source .
if($LASTEXITCODE -ne 0){throw 'PACKAGE_FAILED'}
$Hash=(Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant()
$Remote='/tmp/dachapar-prices-'+[guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 deploy@135.106.137.195 "umask 077 && mkdir '$Remote'"
if($LASTEXITCODE -ne 0){throw 'SSH_FAILED'}
& scp $Package "deploy@135.106.137.195:$Remote/source.tar.gz"
if($LASTEXITCODE -ne 0){throw 'SCP_FAILED'}
& ssh deploy@135.106.137.195 "cd '$Remote' && printf '%s  source.tar.gz\n' '$Hash' | sha256sum -c - && mkdir source && tar -xzf source.tar.gz -C source"
if($LASTEXITCODE -ne 0){throw 'SERVER_PACKAGE_FAILED'}
& ssh -t deploy@135.106.137.195 "sudo python3 '$Remote/source/ops/price-release-install.py' --source '$Remote/source' --source-sha '$SourceSha'"
if($LASTEXITCODE -ne 0){throw 'PRICE_INSTALL_STOPPED'}
$env:DACHA_SEARCH_BASE='https://xn--80aaan1dh9b.xn--p1ai/'
$env:DACHA_QA_BASE='https://xn--80aaan1dh9b.xn--p1ai/'
try{
 & py -3 (Join-Path $Source 'tests/browser_manager_entry.py')
 if($LASTEXITCODE -ne 0){throw 'LIVE_MANAGER_CTA_QA_FAILED; use the printed rollback command if required'}
 & py -3 (Join-Path $Source 'tests/browser_search_smoke.py')
 if($LASTEXITCODE -ne 0){throw 'LIVE_SEARCH_QA_FAILED; use the printed rollback command if required'}
 & py -3 (Join-Path $Source 'tests/browser_v66_smoke.py')
 if($LASTEXITCODE -ne 0){throw 'LIVE_PRODUCT_QA_FAILED; use the printed rollback command if required'}
}finally{
 Remove-Item Env:DACHA_SEARCH_BASE -ErrorAction SilentlyContinue
 Remove-Item Env:DACHA_QA_BASE -ErrorAction SilentlyContinue
}
Write-Host ('PRICE_RELEASE_SHA='+$SourceSha)
Write-Host 'PRICE_RELEASE=PASS; SOURCE=GOOGLE_SHEETS_COLUMN_C; SYNC_MODE=REVIEWED_SNAPSHOT; PAID_TRAFFIC=OFF'
