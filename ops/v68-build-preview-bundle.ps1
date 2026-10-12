# V6.8 exact source review bundle: STATIC + SHARED PRICEBOOK + BACKEND (no secrets).
# Does not execute any remote command or modify an active server.
param([string]$DestinationDirectory=(Join-Path $env:USERPROFILE 'Downloads'))
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Sha=(git -C $Repo rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $Sha -notmatch '^[0-9a-f]{40}$'){throw 'V68_INVALID_GIT_SHA'}
$Changed=@(git -C $Repo status --porcelain)
if($LASTEXITCODE -ne 0 -or $Changed.Count -ne 0){throw 'V68_SOURCE_NOT_CLEAN'}
$Static=@(
 'index.html','manager.html','privacy.html','consent.html',
 'assets/css/site.css','assets/css/themes-v5.css','assets/css/v5-finish.css',
 'assets/css/weather-v6.css','assets/css/manager.css',
 'assets/js/app.js','assets/js/catalog-gallery-v68.js','assets/js/media-v5.js','assets/js/quote-engine.js',
 'assets/js/weather-v6.js','assets/js/manager.js',
 'data/pricebook.js','data/catalog-pricebook.json',
 'assets/images/garant-bani-favicon.svg','assets/images/real-quadro.webp',
 'assets/images/real-quadro-side.webp'
)
$Server=@('server/garant-bani-relay.mjs','server/lead-store.mjs','server/manager-auth.mjs','server/manager-api.mjs','data/legacy-v64-pricebook.js')
$OldManifest=(Join-Path $Repo 'assets\media-v5\MEDIA-MANIFEST.json')
$NewManifest=(Join-Path $Repo 'assets\catalog-v66\MEDIA-MANIFEST.json')
$AIMediaManifest=(Join-Path $Repo 'assets\catalog-v68-ai\MEDIA-MANIFEST.json')
if(!(Test-Path -LiteralPath $OldManifest) -or !(Test-Path -LiteralPath $NewManifest) -or !(Test-Path -LiteralPath $AIMediaManifest)){throw 'V68_MEDIA_MANIFESTS_MISSING'}
$Old=Get-Content -LiteralPath $OldManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$New=Get-Content -LiteralPath $NewManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$AI=Get-Content -LiteralPath $AIMediaManifest -Raw -Encoding UTF8 | ConvertFrom-Json
if(@($Old.photos).Count -ne 12 -or @($New.images).Count -ne 34){throw 'V68_MEDIA_COUNT_MISMATCH'}
if($New.publicationStatus -ne 'OWNER_MEDIA_RIGHTS_AND_RENDER_TRUTH_TO_VERIFY'){throw 'V68_MEDIA_STATUS_UNEXPECTED'}
if(@($AI.images).Count -ne 7 -or $AI.publicationStatus -ne 'OWNER_AI_MEDIA_REVIEW_REQUIRED'){throw 'V68_AI_MEDIA_STATUS_OR_COUNT_MISMATCH'}
$Tmp=Join-Path $env:TEMP ('gb-v68-build-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -Path $Tmp -ItemType Directory -Force | Out-Null
$HashRows=New-Object System.Collections.Generic.List[object]
function Add-Checked([string]$Relative,[string]$Expected=''){
 $Path=Join-Path $Repo ($Relative -replace '/','\')
 if(!(Test-Path -LiteralPath $Path -PathType Leaf)){throw ('V68_SOURCE_ASSET_MISSING_'+$Relative)}
 $Hash=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
 if($Expected -and $Hash -ne $Expected){throw ('V68_ASSET_SHA_MISMATCH_'+$Relative)}
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
 Add-Checked 'assets/catalog-v68-ai/MEDIA-MANIFEST.json'
 foreach($p in @($Old.photos)){Add-Checked ('assets/media-v5/'+[string]$p.file) ([string]$p.sha256)}
 foreach($p in @($New.images)){Add-Checked ('assets/catalog-v66/'+[string]$p.file) ([string]$p.sha256)}
 foreach($p in @($AI.images)){Add-Checked ('assets/catalog-v68-ai/'+[string]$p.file) ([string]$p.sha256)}
 $Meta=@{sourceSha=$Sha;type='PREVIEW_REVIEW_ONLY_NOT_DEPLOY_INSTALLER';status='CATALOG_DRAFT';staticFiles=$Static.Count;backendFiles=$Server.Count;imagesOld=12;imagesNew=34;imagesAI=7;checksums=$HashRows}
 $Meta | ConvertTo-Json -Depth 12 | Out-File -LiteralPath (Join-Path $Tmp 'GB-V68-RELEASE-MANIFEST.json') -Encoding UTF8
 $Id=$Sha.Substring(0,12)
 $Archive=Join-Path $DestinationDirectory ("GB-V68-review-release-"+$Id+".zip")
 $Sidecar=Join-Path $DestinationDirectory ("GB-V68-review-release-"+$Id+".sha256.txt")
 Compress-Archive -Path (Join-Path $Tmp '*') -DestinationPath $Archive -Force
 $ZipHash=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText($Sidecar,($ZipHash+'  '+(Split-Path -Leaf $Archive)+[Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
 Write-Host ('V68_REVIEW_ZIP='+$Archive)
 Write-Host ('V68_REVIEW_SHA256='+$ZipHash)
 Write-Host ('V68_SOURCE_SHA='+$Sha)
 Write-Host ('V68_FILESET='+$HashRows.Count)
 Write-Host 'V68_BACKEND_IN_BUNDLE=YES'
 Write-Host 'V68_LIVE_SERVER_MUTATIONS=0'
 Write-Host 'V68_REVIEW_BUNDLE=PASS'
}finally{
 if(Test-Path -LiteralPath $Tmp){Remove-Item -LiteralPath $Tmp -Recurse -Force}
}
