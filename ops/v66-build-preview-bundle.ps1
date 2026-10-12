# V6.6 exact source review bundle: STATIC + SHARED PRICEBOOK + BACKEND (no secrets).
# Does not execute any remote command or modify an active server.
param([string]$DestinationDirectory=(Join-Path $env:USERPROFILE 'Downloads'))
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Sha=(git -C $Repo rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $Sha -notmatch '^[0-9a-f]{40}$'){throw 'V66_INVALID_GIT_SHA'}
$Changed=@(git -C $Repo status --porcelain)
if($LASTEXITCODE -ne 0 -or $Changed.Count -ne 0){throw 'V66_SOURCE_NOT_CLEAN'}
$Static=@(
 'index.html','manager.html','privacy.html','consent.html',
 'assets/css/site.css','assets/css/themes-v5.css','assets/css/v5-finish.css',
 'assets/css/weather-v6.css','assets/css/manager.css',
 'assets/js/app.js','assets/js/media-v5.js','assets/js/quote-engine.js',
 'assets/js/weather-v6.js','assets/js/manager.js',
 'data/pricebook.js','data/catalog-pricebook.json',
 'assets/images/garant-bani-favicon.svg','assets/images/real-quadro.webp',
 'assets/images/real-quadro-side.webp'
)
$Server=@('server/garant-bani-relay.mjs','server/lead-store.mjs','server/manager-auth.mjs','server/manager-api.mjs','data/legacy-v64-pricebook.js')
$OldManifest=(Join-Path $Repo 'assets\media-v5\MEDIA-MANIFEST.json')
$NewManifest=(Join-Path $Repo 'assets\catalog-v66\MEDIA-MANIFEST.json')
if(!(Test-Path -LiteralPath $OldManifest) -or !(Test-Path -LiteralPath $NewManifest)){throw 'V66_MEDIA_MANIFESTS_MISSING'}
$Old=Get-Content -LiteralPath $OldManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$New=Get-Content -LiteralPath $NewManifest -Raw -Encoding UTF8 | ConvertFrom-Json
if(@($Old.photos).Count -ne 12 -or @($New.images).Count -ne 34){throw 'V66_MEDIA_COUNT_MISMATCH'}
if($New.publicationStatus -ne 'OWNER_MEDIA_RIGHTS_AND_RENDER_TRUTH_TO_VERIFY'){throw 'V66_MEDIA_STATUS_UNEXPECTED'}
$Tmp=Join-Path $env:TEMP ('gb-v66-build-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -Path $Tmp -ItemType Directory -Force | Out-Null
$HashRows=New-Object System.Collections.Generic.List[object]
function Add-Checked([string]$Relative,[string]$Expected=''){
 $Path=Join-Path $Repo ($Relative -replace '/','\')
 if(!(Test-Path -LiteralPath $Path -PathType Leaf)){throw ('V66_SOURCE_ASSET_MISSING_'+$Relative)}
 $Hash=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
 if($Expected -and $Hash -ne $Expected){throw ('V66_ASSET_SHA_MISMATCH_'+$Relative)}
 $Dst=Join-Path $Tmp ($Relative -replace '/','\')
 New-Item -ItemType Directory -Path (Split-Path -Parent $Dst) -Force | Out-Null
 Copy-Item -LiteralPath $Path -Destination $Dst -Force
 $HashRows.Add(@{path=$Relative;sha256=$Hash}) | Out-Null
}
try{
 foreach($file in $Static){Add-Checked $file}
 foreach($file in $Server){Add-Checked $file}
 Add-Checked 'assets/media-v5/MEDIA-MANIFEST.json'
 Add-Checked 'assets/catalog-v66/MEDIA-MANIFEST.json'
 foreach($p in @($Old.photos)){Add-Checked ('assets/media-v5/'+[string]$p.file) ([string]$p.sha256)}
 foreach($p in @($New.images)){Add-Checked ('assets/catalog-v66/'+[string]$p.file) ([string]$p.sha256)}
 $Meta=@{sourceSha=$Sha;type='PREVIEW_REVIEW_ONLY_NOT_DEPLOY_INSTALLER';status='CATALOG_DRAFT';staticFiles=$Static.Count;backendFiles=$Server.Count;imagesOld=12;imagesNew=34;checksums=$HashRows}
 $Meta | ConvertTo-Json -Depth 12 | Out-File -LiteralPath (Join-Path $Tmp 'GB-V66-RELEASE-MANIFEST.json') -Encoding UTF8
 $Id=$Sha.Substring(0,12)
 $Archive=Join-Path $DestinationDirectory ("GB-V66-review-release-"+$Id+".zip")
 $Sidecar=Join-Path $DestinationDirectory ("GB-V66-review-release-"+$Id+".sha256.txt")
 Compress-Archive -Path (Join-Path $Tmp '*') -DestinationPath $Archive -Force
 $ZipHash=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText($Sidecar,($ZipHash+'  '+(Split-Path -Leaf $Archive)+[Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
 Write-Host ('V66_REVIEW_ZIP='+$Archive)
 Write-Host ('V66_REVIEW_SHA256='+$ZipHash)
 Write-Host ('V66_SOURCE_SHA='+$Sha)
 Write-Host ('V66_FILESET='+$HashRows.Count)
 Write-Host 'V66_BACKEND_IN_BUNDLE=YES'
 Write-Host 'V66_LIVE_SERVER_MUTATIONS=0'
 Write-Host 'V66_REVIEW_BUNDLE=PASS'
}finally{
 if(Test-Path -LiteralPath $Tmp){Remove-Item -LiteralPath $Tmp -Recurse -Force}
}
