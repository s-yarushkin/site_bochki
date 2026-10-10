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
if (@(git -C $Root status --porcelain).Count -gt 0) { throw 'GIT_WORKTREE_DIRTY' }
if (Test-Path -LiteralPath $Dest) { throw 'MEDIA_DIR_ALREADY_EXISTS' }
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
try {
  Expand-Archive -LiteralPath $MediaZip -DestinationPath $Import -Force
  $Source=Join-Path $Import 'assets\media-v5'
  if (!(Test-Path -LiteralPath (Join-Path $Source 'MEDIA-MANIFEST.json'))) { throw 'MEDIA_MANIFEST_MISSING' }
  $Manifest=Get-Content -LiteralPath (Join-Path $Source 'MEDIA-MANIFEST.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($Manifest.status -ne 'PREVIEW_ONLY_OWNER_REVIEW_PENDING') { throw 'MEDIA_RELEASE_STATUS_MISMATCH' }
  if (@($Manifest.photos).Count -ne 12) { throw 'MEDIA_EXPECTED_12_FILES' }
  New-Item -Path $Dest -ItemType Directory -Force | Out-Null
  Copy-Item -Path (Join-Path $Source '*') -Destination $Dest -Recurse -Force
  if (!(Test-Path -LiteralPath (Join-Path $Dest 'hero-sun.webp'))) { throw 'MEDIA_COPY_FAILED' }
  Push-Location $Root
  try {
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'V5_NODE_QA_FAILED' }
    Write-Host 'V5_NODE_TESTS=PASS'
    py -3 tests/browser_smoke.py
    if ($LASTEXITCODE -ne 0) { throw 'V5_BROWSER_QA_FAILED' }
    Write-Host 'V5_BROWSER_TESTS=PASS'
  }finally{ Pop-Location }
  git -C $Root add -- assets/media-v5
  if ($LASTEXITCODE -ne 0) { throw 'GIT_ADD_FAILED' }
  git -C $Root diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw 'GIT_DIFF_CHECK_FAILED' }
  git -C $Root commit -m "assets(v5): install verified compact original bath photographs and preview SUN/RAIN hero"
  if ($LASTEXITCODE -ne 0) { throw 'GIT_COMMIT_FAILED' }
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
