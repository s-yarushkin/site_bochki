# Garant Bani V5. Build a static-only immutable preview ZIP, no secrets/backend.
# Run from a clean exact Git checkout with all 12 local media assets installed.
param([string]$DestinationDirectory = (Join-Path $env:USERPROFILE 'Downloads'))
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Sha=(git -C $Repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $Sha -notmatch '^[0-9a-f]{40}$') { throw 'INVALID_SOURCE_SHA' }
if (@(git -C $Repo status --porcelain).Count -gt 0) { throw 'SOURCE_WORKTREE_NOT_CLEAN' }
$Id=$Sha.Substring(0,12)
$Out=Join-Path $DestinationDirectory ("GB-V5-static-preview-"+$Id+".zip")
$ManifestOutput=Join-Path $DestinationDirectory ("GB-V5-static-preview-"+$Id+".sha256.txt")
$Temp=Join-Path $env:TEMP ('gb-v5-release-'+[guid]::NewGuid().ToString('N').Substring(0,8))
$Static=@(
  'index.html','manager.html','privacy.html','consent.html',
  'assets/css/site.css','assets/css/themes-v5.css','assets/css/v5-finish.css',
  'assets/css/manager.css','assets/js/app.js','assets/js/media-v5.js',
  'assets/js/quote-engine.js','assets/js/manager.js','data/pricebook.js',
  'assets/images/placeholder.svg','assets/images/real-quadro.webp',
  'assets/images/real-quadro-side.webp'
)
$MediaManifest=Join-Path $Repo 'assets\media-v5\MEDIA-MANIFEST.json'
if (!(Test-Path -LiteralPath $MediaManifest)) { throw 'MEDIA_NOT_STAGED' }
$Media=Get-Content -LiteralPath $MediaManifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Media.status -ne 'PREVIEW_ONLY_OWNER_REVIEW_PENDING') { throw 'MEDIA_NOT_FOR_PREVIEW' }
if (@($Media.photos).Count -ne 12) { throw 'INVALID_MEDIA_COUNT' }
try {
  New-Item -Path $Temp -ItemType Directory -Force | Out-Null
  foreach ($Relative in $Static) {
    $Source=Join-Path $Repo $Relative
    if (!(Test-Path -LiteralPath $Source -PathType Leaf)) { throw ('STATIC_MISSING_'+$Relative) }
    $Dest=Join-Path $Temp $Relative
    New-Item -Path (Split-Path -Parent $Dest) -ItemType Directory -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Dest -Force
  }
  foreach ($Item in @($Media.photos)) {
    $Name=[string]$Item.file
    if ($Name -notmatch '^[a-z0-9-]+\.webp$') { throw 'UNSAFE_MEDIA_FILENAME' }
    $Relative='assets/media-v5/'+$Name
    $Source=Join-Path $Repo $Relative
    if (!(Test-Path -LiteralPath $Source -PathType Leaf)) { throw ('MISSING_MEDIA_'+$Name) }
    $Hash=(Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Hash -ne [string]$Item.sha256) { throw ('MEDIA_SHA_MISMATCH_'+$Name) }
    $Dest=Join-Path $Temp $Relative
    New-Item -Path (Split-Path -Parent $Dest) -ItemType Directory -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Dest -Force
  }
  Compress-Archive -Path (Join-Path $Temp '*') -DestinationPath $Out -Force
  if (!(Test-Path -LiteralPath $Out)) { throw 'PREVIEW_ZIP_FAILED' }
  $ZipHash=(Get-FileHash -LiteralPath $Out -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText($ManifestOutput,($ZipHash+'  '+(Split-Path -Leaf $Out)+[Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
  Write-Host ('STATIC_PREVIEW_ZIP='+$Out)
  Write-Host ('STATIC_PREVIEW_SHA256='+$ZipHash)
  Write-Host ('SOURCE_SHA='+$Sha)
  Write-Host 'STATIC_ONLY=YES'
  Write-Host 'BACKEND_AND_SECRETS_NOT_PACKAGED=YES'
  Write-Host 'PRODUCTION_UNCHANGED=YES'
}finally{
  if (Test-Path -LiteralPath $Temp) { Remove-Item -LiteralPath $Temp -Recurse -Force }
}
