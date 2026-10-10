# Garant Bani V6.1 - source controlled QA and static release packaging.
# No remote commands, sudo, service changes or live customer requests.
param([string]$DestinationDirectory=(Join-Path $env:USERPROFILE 'Downloads'))
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Branch='fix/13-v61-clouds-layout-photo-consistency'
$Current=(git -C $Root branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $Current -ne $Branch) { throw 'WRONG_V61_BRANCH' }
$Clean=@(git -C $Root status --porcelain)
if ($LASTEXITCODE -ne 0 -or $Clean.Count -gt 0) { throw 'SOURCE_WORKTREE_NOT_CLEAN' }
$Sha=(git -C $Root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $Sha -notmatch '^[0-9a-f]{40}$') { throw 'INVALID_SOURCE_SHA' }
$Env:PYTHONUTF8='1'
$Env:PYTHONIOENCODING='utf-8'
Push-Location $Root
try {
  npm run check
  if ($LASTEXITCODE -ne 0) { throw 'V61_NODE_QA_FAILED' }
  Write-Host 'V61_NODE_QA=PASS'
  py -3 tests/browser_smoke.py
  if ($LASTEXITCODE -ne 0) { throw 'V61_BROWSER_QA_FAILED' }
  Write-Host 'V61_BROWSER_QA=PASS'
  py -3 tests/manager-browser-smoke.py
  if ($LASTEXITCODE -ne 0) { throw 'V61_MANAGER_QA_FAILED' }
  Write-Host 'V61_MANAGER_QA=PASS'

  $SunRain=Join-Path $env:TEMP 'garant-bani-v61-mobile-qa'
  $Manager=Join-Path $env:TEMP 'garant-bani-v61-manager-qa'
  if (!(Test-Path -LiteralPath $SunRain) -or !(Test-Path -LiteralPath $Manager)) { throw 'V61_SCREENSHOTS_NOT_FOUND' }
  $Screenshots=Join-Path $DestinationDirectory ("GB-V61-CLOUDS-QA-"+$Sha.Substring(0,12)+".zip")
  Compress-Archive -LiteralPath $SunRain,$Manager -DestinationPath $Screenshots -Force
  if (!(Test-Path -LiteralPath $Screenshots)) { throw 'V61_QA_ZIP_FAILED' }
  Write-Host ('V61_QA_SCREENSHOTS='+$Screenshots)

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'ops\v61-build-preview-zip.ps1') -DestinationDirectory $DestinationDirectory
  if ($LASTEXITCODE -ne 0) { throw 'V61_STATIC_PACKAGE_FAILED' }
  # Do not report ALL_QA=PASS while the expected source-pinned artifacts are absent.
  $Id=$Sha.Substring(0,12)
  $Package=Join-Path $DestinationDirectory ("GB-V61-static-preview-"+$Id+".zip")
  $Sidecar=Join-Path $DestinationDirectory ("GB-V61-static-preview-"+$Id+".sha256.txt")
  foreach ($Artifact in @($Package,$Sidecar,$Screenshots)) {
    if (!(Test-Path -LiteralPath $Artifact -PathType Leaf)) { throw ('V61_STATIC_ARTIFACT_MISSING_'+$Artifact) }
  }
  $ActualHash=(Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant()
  $SidecarText=(Get-Content -LiteralPath $Sidecar -Raw -Encoding UTF8).Trim()
  if ($SidecarText -ne ($ActualHash+'  '+(Split-Path -Leaf $Package))) {
    throw 'V61_STATIC_ZIP_SIDECAR_MISMATCH'
  }
  Write-Host 'V61_STATIC_ARTIFACTS_VERIFIED=PASS'
  Write-Host ('V61_STATIC_PREVIEW_ZIP_SHA256='+$ActualHash)

  Write-Host ('V61_SOURCE_SHA='+$Sha)
  Write-Host 'V61_ALL_QA=PASS'
  Write-Host 'PRODUCTION_UNCHANGED=YES'
}finally{ Pop-Location }
