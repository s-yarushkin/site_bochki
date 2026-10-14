# Reproducible, local-only review bundles for QUADRO READY + shared relay/manager.
# NEVER changes live website, SQLite, Caddy, DNS, or MAX.
[CmdletBinding()]
param(
  [string]$DestinationDirectory=(Join-Path $env:USERPROFILE 'Downloads'),
  [switch]$SkipTests
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Sha=(git -C $Repo rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $Sha -notmatch '^[0-9a-f]{40}$'){throw 'QUADRO_INVALID_GIT_SHA'}
$Dirty=@(git -C $Repo status --porcelain --untracked-files=no)
if($LASTEXITCODE -ne 0 -or $Dirty.Count -gt 0){throw 'QUADRO_TRACKED_SOURCE_NOT_CLEAN'}
if(!(Test-Path -LiteralPath $DestinationDirectory)){New-Item -Path $DestinationDirectory -ItemType Directory -Force|Out-Null}
if(-not $SkipTests){
  Push-Location $Repo
  try{
    npm run check
    if($LASTEXITCODE -ne 0){throw 'QUADRO_FULL_LOCAL_CHECK_FAILED'}
    Write-Host 'QUADRO_TESTS=PASS'
  }finally{Pop-Location}
}else{Write-Host 'QUADRO_TESTS=SKIPPED_EXPLICITLY'}
$Static=@(
  'quadro-ready/index.html','quadro-ready/site.css','quadro-ready/site.js',
  'quadro-ready/privacy.html','quadro-ready/consent.html'
)
$Shared=@(
  'server/quadro-ready.mjs','server/garant-bani-relay.mjs','server/lead-store.mjs',
  'server/manager-api.mjs','server/manager-auth.mjs',
  'assets/js/quote-engine.js','data/pricebook.js','data/legacy-v64-pricebook.js',
  'manager.html','assets/js/manager.js','assets/css/manager.css'
)
$Media=@()
foreach($name in @('hero-side','full-side','side-perspective','end-window','lounge','steam-wide',
   'steam-shelves','stove-tank','stove-wide','firebox','drain','exterior-proof')){
  $mediaRel='quadro-ready/media/'+$name+'.webp'
  if(Test-Path -LiteralPath (Join-Path $Repo ($mediaRel -replace '/','\'))){$Media+= $mediaRel}
}
if($Media.Count -ne 0 -and $Media.Count -ne 12){throw 'QUADRO_INCOMPLETE_MEDIA_SET'}
$Tmp=Join-Path $env:TEMP ('quadro-ready-bundle-'+[Guid]::NewGuid().ToString('N'))
New-Item -Path $Tmp -ItemType Directory -Force|Out-Null
function AddFile([string]$Rel,[string]$Base,[System.Collections.Generic.List[object]]$Checks){
  $source=Join-Path $Repo ($Rel -replace '/','\')
  if(!(Test-Path -LiteralPath $source -PathType Leaf)){throw ('QUADRO_FILE_MISSING_'+$Rel)}
  $target=Join-Path $Base ($Rel -replace '/','\')
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force|Out-Null
  Copy-Item -LiteralPath $source -Destination $target
  $Checks.Add(@{path=$Rel;sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()})|Out-Null
}
try{
  $Id=$Sha.Substring(0,12)
  foreach($pair in @(@{name='site';items=@($Static)+@($Media)},@{name='relay-manager';items=$Shared})){
    $stage=Join-Path $Tmp $pair.name
    New-Item -Path $stage -ItemType Directory -Force|Out-Null
    $checks=New-Object 'System.Collections.Generic.List[object]'
    foreach($rel in $pair.items){AddFile -Rel $rel -Base $stage -Checks $checks}
    $meta=@{sourceSHA=$Sha;component=$pair.name;kind='REVIEW_ONLY_NOT_DEPLOYED';
      productionMutation=0;mediaCount=$Media.Count;files=@($checks)}
    $manifest=Join-Path $stage 'QUADRO-REVIEW-MANIFEST.json'
    [IO.File]::WriteAllText($manifest,($meta|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
    $zip=Join-Path $DestinationDirectory ('QUADRO-'+$pair.name+'-review-'+$Id+'.zip')
    if(Test-Path -LiteralPath $zip){throw ('QUADRO_ARCHIVE_ALREADY_EXISTS_'+$zip)}
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
    $sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText(($zip+'.sha256.txt'),($sha256+'  '+(Split-Path -Leaf $zip)+[Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
    Write-Host ('QUADRO_REVIEW_'+$pair.name.ToUpperInvariant()+'_ZIP='+$zip)
    Write-Host ('QUADRO_REVIEW_'+$pair.name.ToUpperInvariant()+'_SHA256='+$sha256)
  }
  Write-Host ('QUADRO_EXACT_SOURCE_SHA='+$Sha)
  Write-Host 'QUADRO_SERVER_WRITES=0'
  Write-Host 'QUADRO_BUNDLES=REVIEW_ONLY'
}finally{
  if(Test-Path $Tmp){Remove-Item -LiteralPath $Tmp -Recurse -Force}
}
