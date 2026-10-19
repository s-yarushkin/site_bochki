# ADS-01 V74 J synchronized WEB+API release, pinned Git SHA, no SQLite backup.
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
foreach($name in @('git','node','npm','py','ssh','scp')) { Get-Command $name -ErrorAction Stop | Out-Null }
$RepoURL='https://github.com/s-yarushkin/site_bochki.git'
$Branch='release/ads01-v74-metrika-rc-20261019'
$Server='deploy@135.106.137.195'
$Run=Join-Path $env:TEMP ('DachaPar-ADS01-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Run -Force | Out-Null
$Repo=Join-Path $Run 'repo'
Write-Host 'ADS01_LOCAL_PREP=START; ADS=OFF; DB_BACKUP=SKIPPED_BY_OWNER'
& git clone --quiet --depth 1 --branch $Branch --single-branch $RepoURL $Repo
if($LASTEXITCODE -ne 0){throw 'GIT_CLONE_FAILED'}
& git -C $Repo config core.autocrlf false
$Actual=(& git -C $Repo rev-parse HEAD).Trim()
if($Actual -ne $SourceSha){throw ('PIN_MISMATCH_EXPECTED_'+$SourceSha+'_GOT_'+$Actual)}
Push-Location $Repo
try {
    & npm.cmd run check
    if($LASTEXITCODE -ne 0){throw 'NODE_TEST_FAILED'}
    & node scripts/verify-v74-public-prices.mjs
    if($LASTEXITCODE -ne 0){throw 'PRICE_J_TEST_FAILED'}
    & py -3 -X utf8 tests/test_ads01_fast_release.py
    if($LASTEXITCODE -ne 0){throw 'FAST_INSTALLER_TEST_FAILED'}
} finally {
    Pop-Location
}
$Archive=Join-Path $Run 'source.tar.gz'
& git -C $Repo -c core.autocrlf=false archive --format=tar.gz "--output=$Archive" $SourceSha
if($LASTEXITCODE -ne 0){throw 'ARCHIVE_FAILED'}
$Installer=Join-Path $Repo 'ops/ads01-fast-install.py'
$ArchiveHash=(Get-FileHash $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
$InstallerHash=(Get-FileHash $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
$Remote='/tmp/dachapar-ads01-'+[guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 $Server "umask 077 && mkdir '$Remote'"
if($LASTEXITCODE -ne 0){throw 'SERVER_STAGING_FAILED'}
& scp $Archive ("{0}:{1}/source.tar.gz" -f $Server,$Remote)
if($LASTEXITCODE -ne 0){throw 'ARCHIVE_UPLOAD_FAILED'}
& scp $Installer ("{0}:{1}/installer.py" -f $Server,$Remote)
if($LASTEXITCODE -ne 0){throw 'INSTALLER_UPLOAD_FAILED'}
& ssh -o ConnectTimeout=15 $Server "cd '$Remote' && printf '%s  source.tar.gz\n%s  installer.py\n' '$ArchiveHash' '$InstallerHash' | sha256sum -c -"
if($LASTEXITCODE -ne 0){throw 'SERVER_SHA256_FAILED'}
Write-Host 'ADS01_LOCAL_QA=PASS; REMOTE_HASH=PASS; STARTING_ATOMIC_WEB_API_SWITCH'
Write-Host 'SUDO will request the EXISTING server password; no new credentials are generated.'
& ssh -tt -o ConnectTimeout=15 $Server "sudo python3 '$Remote/installer.py' --archive '$Remote/source.tar.gz' --archive-sha256 '$ArchiveHash' --source-sha '$SourceSha'"
if($LASTEXITCODE -ne 0){throw 'ADS01_INSTALLER_STOPPED_SEE_LAST_SERVER_ERROR_NO_BLIND_RETRY'}
Write-Host ('ADS01_SOURCE_SHA='+$SourceSha)
Write-Host 'ADS01_OWNER_RUN=PASS; WEB_AND_API_UPDATED; DATABASE_UNCHANGED_BY_INSTALLER'
Write-Host ('LOCAL_RUN_EVIDENCE='+$Run)
