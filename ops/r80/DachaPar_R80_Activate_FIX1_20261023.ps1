# Dacha Par R8.0 FIX1: guarded WEB-only activation of an already staged, browser-accepted release.
# No GitHub Actions. Without -Deploy, remote preflight only; no public site switch.
param(
  [switch]$Deploy,
  [string]$PackagePath=(Join-Path $env:USERPROFILE 'Downloads\DachaPar_R80_IA_Model_First_FIX1_20261023.zip')
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ExpectedHash='fd215c2d1684828fb7dc90ca4851a39ec7a8516a6c4102dbf460937f4d9730bf'
$Stage='/srv/sites/dachapar-preview/releases/CJM-R80-20261022-1792731611547801280'
$ExpectedPrevious='/srv/sites/dachapar-preview/releases/GALLERY-UNIFIED-20261022-parus-qh-v1-1792680175428407103'
$Server='deploy@135.106.137.195'
$SshOptions=@('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) { throw "R80_PACKAGE_NOT_FOUND=$PackagePath" }
$PackagePath=(Resolve-Path -LiteralPath $PackagePath).Path
$ActualHash=(Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualHash -ne $ExpectedHash) { throw "R80_ARCHIVE_MISMATCH_NO_DEPLOY; EXPECTED=$ExpectedHash; ACTUAL=$ActualHash" }
foreach ($tool in @('ssh','scp')) { Get-Command $tool -ErrorAction Stop | Out-Null }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Zip=[IO.Compression.ZipFile]::OpenRead($PackagePath)
try {
  foreach ($entry in $Zip.Entries) {
    if ([IO.Path]::IsPathRooted($entry.FullName) -or
        $entry.FullName.Contains('\') -or
        (($entry.FullName -split '/') -contains '..')) { throw 'R80_UNSAFE_ZIP_ENTRY' }
  }
  foreach ($required in @('install.py','transform.py','SITE_MAP_R80.md')) {
    if ($null -eq $Zip.GetEntry($required)) { throw "R80_MISSING_PACKAGE_ENTRY=$required" }
  }
} finally { $Zip.Dispose() }
Write-Host "R80_PACKAGE=VERIFIED; HASH=$ActualHash; MODE=$(if ($Deploy) { 'DEPLOY' } else { 'READ_ONLY_PREFLIGHT' })"
Write-Host "R80_EXPECTED_STAGE=$Stage"
Write-Host "R80_EXPECTED_PREVIOUS_WEB=$ExpectedPrevious"
$Remote='/tmp/dachapar-r80-activation-'+[guid]::NewGuid().ToString('N')
& ssh @SshOptions $Server "umask 077 && mkdir -m 700 '$Remote'"
if ($LASTEXITCODE -ne 0) { throw 'R80_REMOTE_STAGING_DIR_FAILED' }
& scp @SshOptions $PackagePath ("{0}:{1}/package.zip" -f $Server,$Remote)
if ($LASTEXITCODE -ne 0) { throw 'R80_PACKAGE_UPLOAD_FAILED' }
& ssh @SshOptions $Server "cd '$Remote' && printf '%s  package.zip\n' '$ExpectedHash' | sha256sum -c - && python3 -m zipfile -e '$Remote/package.zip' '$Remote/kit'"
if ($LASTEXITCODE -ne 0) { throw 'R80_REMOTE_PACKAGE_VERIFICATION_FAILED' }
Write-Host 'R80_FINAL_PREFLIGHT_BEGIN; USE_EXISTING_SUDO_PASSWORD'
& ssh -tt @SshOptions $Server "sudo python3 '$Remote/kit/install.py'"
if ($LASTEXITCODE -ne 0) { throw 'R80_SOURCE_DRIFT_OR_PREFLIGHT_FAILED; NO_SITE_SWITCH' }
if (-not $Deploy) {
  Write-Host 'R80_ACTIVATION_PREFLIGHT=PASS; PUBLIC_SITE_SWITCH=NO; PRODUCTION_WRITES=0'
  Write-Host 'To activate this browser-accepted stage, rerun with -Deploy.'
  exit 0
}
Write-Host 'R80_ACTIVATION_BEGIN; EXPECT_SOURCE_MATCH_AND_ATOMIC_WEB_SWITCH_WITH_AUTO_ROLLBACK'
& ssh -tt @SshOptions $Server "sudo python3 '$Remote/kit/install.py' --activate '$Stage'"
if ($LASTEXITCODE -ne 0) { throw 'R80_DEPLOY_FAILED; CHECK_R80_ROLLBACK_OUTPUT_AND_LIVE_POINTER' }
Write-Host 'R80_WEB_RELEASE=DEPLOYED; API_UNCHANGED=YES; PUBLIC_HASH_SMOKE=PASS'
Write-Host 'R80_BUSINESS_ACCEPTANCE_PENDING=LIVE_LEAD_MANAGER_MAX_AND_VISUAL_REVIEW'
