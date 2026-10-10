# Garant Bani V5: stage a downloaded media package, run tests, then push ONE branch.
# Windows PowerShell 5.1 safe ASCII source. No SSH, sudo, server writes or deployment.
param(
  [string]$MediaZip = (Join-Path $env:USERPROFILE 'Downloads\GB-V5-SUN-RAIN-release-media.zip'),
  [switch]$NoPush
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Branch='feat/garant-bani-v5-final-site-sun-rain'
$Import=Join-Path $env:TEMP ('gb-v5-media-import-'+[guid]::NewGuid().ToString('N').Substring(0,8))
$Dest=Join-Path $Root 'assets\media-v5'
if (!(Test-Path -LiteralPath $MediaZip -PathType Leaf)) { throw 'MEDIA_ZIP_NOT_FOUND' }
if ((git -C $Root rev-parse --abbrev-ref HEAD).Trim() -ne $Branch) { throw 'WRONG_GIT_BRANCH' }
if ($LASTEXITCODE -ne 0) { throw 'GIT_HEAD_ERROR' }
$Tracked=@(git -C $Root status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0 -or $Tracked.Count -gt 0) { throw 'TRACKED_WORKTREE_DIRTY' }
# The previous failed run may have left only verified media files as untracked.
$UntrackedOther=@(git -C $Root ls-files --others --exclude-standard | Where-Object {
  $_ -notmatch '^assets/media-v5/(?:MEDIA-MANIFEST\.json|[a-z0-9-]+\.webp)$'
})
if ($LASTEXITCODE -ne 0 -or $UntrackedOther.Count -gt 0) {
  throw ('UNEXPECTED_UNTRACKED_FILES: '+($UntrackedOther -join ','))
}
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
try {
  if (Test-Path -LiteralPath $Dest) {
    Write-Host 'MEDIA_IMPORT_RESUMED=YES'
  } else {
    Expand-Archive -LiteralPath $MediaZip -DestinationPath $Import -Force
    $Source=Join-Path $Import 'assets\media-v5'
    if (!(Test-Path -LiteralPath (Join-Path $Source 'MEDIA-MANIFEST.json'))) { throw 'MEDIA_MANIFEST_MISSING' }
    New-Item -Path $Dest -ItemType Directory -Force | Out-Null
    Copy-Item -Path (Join-Path $Source '*') -Destination $Dest -Recurse -Force
  }
  $ManifestFile=Join-Path $Dest 'MEDIA-MANIFEST.json'
  if (!(Test-Path -LiteralPath $ManifestFile)) { throw 'MEDIA_MANIFEST_MISSING' }
  $Manifest=Get-Content -LiteralPath $ManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($Manifest.status -ne 'PREVIEW_ONLY_OWNER_REVIEW_PENDING') { throw 'MEDIA_RELEASE_STATUS_MISMATCH' }
  if (@($Manifest.photos).Count -ne 12) { throw 'MEDIA_EXPECTED_12_FILES' }
  foreach ($Item in @($Manifest.photos)) {
    $File=Join-Path $Dest ([string]$Item.file)
    if (!(Test-Path -LiteralPath $File -PathType Leaf)) { throw ('MEDIA_MISSING_'+$Item.file) }
    $Hash=(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Hash -ne [string]$Item.sha256) { throw ('MEDIA_SHA_MISMATCH_'+$Item.file) }
  }
  Write-Host 'MEDIA_SHA256=PASS'
  Push-Location $Root
  try {
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'V5_NODE_QA_FAILED' }
    Write-Host 'V5_NODE_TESTS=PASS'
    py -3 tests/browser_smoke.py
    if ($LASTEXITCODE -ne 0) { throw 'V5_BROWSER_QA_FAILED' }
    Write-Host 'V5_BROWSER_TESTS=PASS'
    py -3 tests/manager-browser-smoke.py
    if ($LASTEXITCODE -ne 0) { throw 'V5_MANAGER_BROWSER_QA_FAILED' }
    Write-Host 'V5_MANAGER_BROWSER=PASS'
    $CustomerShots=Join-Path $env:TEMP 'garant-bani-mobile-qa'
    $ManagerShots=Join-Path $env:TEMP 'garant-bani-manager-qa'
    $QAZip=Join-Path $env:USERPROFILE 'Downloads\GB-V5-SUN-RAIN-QA-screenshots.zip'
    if (!(Test-Path -LiteralPath $CustomerShots) -or !(Test-Path -LiteralPath $ManagerShots)) { throw 'QA_SCREENSHOTS_MISSING' }
    Compress-Archive -LiteralPath $CustomerShots,$ManagerShots -DestinationPath $QAZip -Force
    if (!(Test-Path -LiteralPath $QAZip)) { throw 'QA_ZIP_NOT_CREATED' }
    Write-Host ('V5_QA_SCREENSHOTS='+$QAZip)
  }finally{ Pop-Location }
  git -C $Root add -- assets/media-v5
  if ($LASTEXITCODE -ne 0) { throw 'GIT_ADD_FAILED' }
  git -C $Root diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw 'GIT_DIFF_CHECK_FAILED' }
  $Staged=@(git -C $Root diff --cached --name-only)
  if ($LASTEXITCODE -ne 0) { throw 'GIT_STAGED_DIFF_FAILED' }
  if ($Staged.Count -gt 0) {
    git -C $Root commit -m "assets(v5): install verified compact original bath photographs and preview SUN/RAIN hero"
    if ($LASTEXITCODE -ne 0) { throw 'GIT_COMMIT_FAILED' }
  } else {
    Write-Host 'MEDIA_ALREADY_COMMITTED=YES'
  }
  if (!$NoPush) {
    git -C $Root push origin "HEAD:refs/heads/$Branch"
    if ($LASTEXITCODE -ne 0) { throw 'GIT_PUSH_FAILED' }
  }
  Write-Host ('STAGED_SHA='+(git -C $Root rev-parse HEAD).Trim())
  Write-Host 'V5_MEDIA=12_FILES_VERIFIED'
  Write-Host 'V5_READY_FOR_STAGING_DEPLOY=YES'
  Write-Host 'PUBLIC_SITE_UNCHANGED=YES'
  Write-Host 'MAX_AND_MANAGER_UNCHANGED=YES'
}finally{
  if (Test-Path -LiteralPath $Import) { Remove-Item -LiteralPath $Import -Recurse -Force }
}
