param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
foreach ($Tool in @('git','node','npm','py','ssh','scp')) { Get-Command $Tool -ErrorAction Stop | Out-Null }
$Run = Join-Path $env:TEMP ('DachaPar-V74-Content-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Run | Out-Null
$Repo = Join-Path $Run 'repo'
& git clone --no-checkout --single-branch --branch release/v74-content-20261019 https://github.com/s-yarushkin/site_bochki.git $Repo
if ($LASTEXITCODE -ne 0) { throw 'CLONE_FAILED' }
& git -C $Repo config core.autocrlf false
& git -C $Repo checkout --detach $SourceSha
if ($LASTEXITCODE -ne 0 -or (& git -C $Repo rev-parse HEAD).Trim() -ne $SourceSha) { throw 'PINNED_CHECKOUT_FAILED' }
if ($env:DACHA_SEARCH_BASE -or $env:DACHA_QA_BASE) { throw 'CLEAR_DACHA_SEARCH_BASE_AND_DACHA_QA_BASE_BEFORE_LOCAL_ACCEPTANCE' }
Push-Location $Repo
try {
    & npm.cmd run check
    if ($LASTEXITCODE -ne 0) { throw 'NODE_CHECK_FAILED' }
    & node scripts/verify-v74-public-prices.mjs
    if ($LASTEXITCODE -ne 0) { throw 'PUBLIC_PRICE_SOURCE_FAILED' }
    & node ops/v74-price-probe.mjs $Repo
    if ($LASTEXITCODE -ne 0) { throw 'CURRENT_AND_V73_PRICE_PROBE_FAILED' }
    & py -3 -X utf8 tests/test_v74_content_release.py
    if ($LASTEXITCODE -ne 0) { throw 'INSTALLER_SAFETY_FAILED' }
    # Browser checks are performed only on this isolated local checkout. No live lead POST.
    & py -3 -X utf8 tests/browser_v74_first_viewport.py --phase after --root $Repo --out-dir (Join-Path $Run 'hero-evidence')
    if ($LASTEXITCODE -ne 0) { throw 'FIRST_VIEWPORT_FAILED' }
    foreach ($Test in @('browser_v74_base_kit.py','browser_mobile_acceptance.py','browser_search_smoke.py','browser_v74_content_release.py')) {
        & py -3 -X utf8 (Join-Path 'tests' $Test)
        if ($LASTEXITCODE -ne 0) { throw ('BROWSER_ACCEPTANCE_FAILED_' + $Test) }
    }
} finally { Pop-Location }
$Archive = Join-Path $Run 'source.tar.gz'
& git -C $Repo -c core.autocrlf=false archive --format=tar.gz "--output=$Archive" $SourceSha
if ($LASTEXITCODE -ne 0) { throw 'GIT_ARCHIVE_FAILED' }
$ArchiveHash = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
$Installer = Join-Path $Repo 'ops/v74-content-install.py'
$InstallerHash = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
$Remote = '/tmp/dachapar-v74-content-' + [guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 deploy@135.106.137.195 "umask 077 && mkdir '$Remote'"
if ($LASTEXITCODE -ne 0) { throw 'SSH_UNAVAILABLE_NOT_DEPLOYED' }
& scp $Archive "deploy@135.106.137.195:$Remote/source.tar.gz"
if ($LASTEXITCODE -ne 0) { throw 'ARCHIVE_UPLOAD_FAILED' }
& scp $Installer "deploy@135.106.137.195:$Remote/installer.py"
if ($LASTEXITCODE -ne 0) { throw 'INSTALLER_UPLOAD_FAILED' }
& ssh deploy@135.106.137.195 "cd '$Remote' && printf '%s  source.tar.gz\n%s  installer.py\n' '$ArchiveHash' '$InstallerHash' | sha256sum -c -"
if ($LASTEXITCODE -ne 0) { throw 'SERVER_TRANSFER_HASH_FAILED' }
Write-Host 'LOCAL_ACCEPTANCE=PASS. Installing the pinned release; sudo may ask for your existing server password.'
& ssh -t deploy@135.106.137.195 "sudo python3 '$Remote/installer.py' --archive '$Remote/source.tar.gz' --archive-sha256 '$ArchiveHash' --source-sha '$SourceSha'"
if ($LASTEXITCODE -ne 0) { throw 'V74_CONTENT_INSTALL_STOPPED; inspect the installer output before retrying' }
Write-Host ('RELEASE_SHA=' + $SourceSha)
Write-Host 'V74_CONTENT_RELEASE=PASS; CONFIGURATOR_REDESIGN=NO; NEW_IMAGE_FILES=0; PRODUCTION_TEST_LEADS=0'
Write-Host ('LOCAL_EVIDENCE=' + $Run)
