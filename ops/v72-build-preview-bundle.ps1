# V7.2 exact source review bundle: STATIC + SHARED PRICEBOOK + BACKEND (no secrets).
# Does not execute any remote command or modify an active server.
param([string]$DestinationDirectory=(Join-Path $env:USERPROFILE 'Downloads'))
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Sha=(git -C $Repo rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $Sha -notmatch '^[0-9a-f]{40}$'){throw 'V72_INVALID_GIT_SHA'}
$Changed=@(git -C $Repo status --porcelain)
if($LASTEXITCODE -ne 0 -or $Changed.Count -ne 0){throw 'V72_SOURCE_NOT_CLEAN'}
$Static=@(
 'index.html','manager.html','privacy.html','consent.html','requisites.html',
 'assets/css/site.css','assets/css/themes-v5.css','assets/css/v5-finish.css',
 'assets/css/weather-v6.css','assets/css/manager.css','assets/css/dachapar-v72.css',
 'assets/js/app.js','assets/js/catalog-gallery-v67.js','assets/js/real-object-gallery-v69.js','assets/js/media-v5.js','assets/js/quote-engine.js',
 'assets/js/weather-v6.js','assets/js/manager.js',
 'data/pricebook.js','data/catalog-pricebook.json',
 'assets/images/garant-bani-favicon.svg','assets/images/dachapar-favicon.svg','assets/images/real-quadro.webp',
 'assets/images/real-quadro-side.webp'
)
$Server=@('server/garant-bani-relay.mjs','server/lead-store.mjs','server/manager-auth.mjs','server/manager-api.mjs','data/legacy-v64-pricebook.js')
$OldManifest=(Join-Path $Repo 'assets\media-v5\MEDIA-MANIFEST.json')
$NewManifest=(Join-Path $Repo 'assets\catalog-v66\MEDIA-MANIFEST.json')
$AIMediaManifest=(Join-Path $Repo 'assets\catalog-v68-ai\MEDIA-MANIFEST.json')
$RealManifest=(Join-Path $Repo 'assets\real-objects\viking\viking-001\MEDIA-MANIFEST.json')
$HouseManifest=(Join-Path $Repo 'assets\real-objects\kvadro-house\kvadro-house-001\MEDIA-MANIFEST.json')
$ParusManifest=(Join-Path $Repo 'assets\real-objects\parus\parus-001\MEDIA-MANIFEST.json')
if(!(Test-Path -LiteralPath $OldManifest) -or !(Test-Path -LiteralPath $NewManifest) -or !(Test-Path -LiteralPath $AIMediaManifest) -or !(Test-Path -LiteralPath $RealManifest) -or !(Test-Path -LiteralPath $HouseManifest) -or !(Test-Path -LiteralPath $ParusManifest)){throw 'V72_MEDIA_MANIFESTS_MISSING'}
$Old=Get-Content -LiteralPath $OldManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$New=Get-Content -LiteralPath $NewManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$AI=Get-Content -LiteralPath $AIMediaManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$Real=Get-Content -LiteralPath $RealManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$House=Get-Content -LiteralPath $HouseManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$Parus=Get-Content -LiteralPath $ParusManifest -Raw -Encoding UTF8 | ConvertFrom-Json
if(@($Old.photos).Count -ne 12 -or @($New.images).Count -ne 34){throw 'V72_MEDIA_COUNT_MISMATCH'}
if($New.publicationStatus -ne 'OWNER_MEDIA_RIGHTS_AND_RENDER_TRUTH_TO_VERIFY'){throw 'V72_MEDIA_STATUS_UNEXPECTED'}
if(@($AI.images).Count -ne 7 -or $AI.publicationStatus -ne 'OWNER_APPROVED_EXACT_SEVEN_MEDIA_ONLY' -or $AI.releaseAuthorization -ne 'NOT_GRANTED_SEPARATE_GO_REQUIRED'){throw 'V72_AI_MEDIA_STATUS_OR_COUNT_MISMATCH'}
if(@($AI.images | Where-Object { $_.ownerApproval -ne 'APPROVED' }).Count -ne 0){throw 'V72_MEDIA_NOT_OWNER_APPROVED'}
if($Real.objectId -ne 'viking-001' -or $Real.modelId -ne 'viking' -or $Real.source -ne 'OWNER_UPLOADED_REAL_PHOTOS' -or @($Real.photos).Count -ne 3){throw 'V72_REAL_PHOTO_MANIFEST_MISMATCH'}
if((@($Real.photos | Where-Object scene -eq 'outside')).Count -ne 2 -or (@($Real.photos | Where-Object scene -eq 'inside')).Count -ne 1){throw 'V72_REAL_PHOTO_SCENE_MISMATCH'}
if($House.objectId -ne 'kvadro-house-001' -or $House.modelId -ne 'kvadro-house' -or $House.source -ne 'OWNER_UPLOADED_REAL_PHOTOS' -or @($House.photos).Count -ne 2){throw 'V72_KVADRO_HOUSE_MANIFEST_MISMATCH'}
if(@($House.photos | Where-Object scene -ne 'outside').Count -ne 0){throw 'V72_KVADRO_HOUSE_SCENE_NOT_OUTSIDE'}
if($Parus.objectId -ne 'parus-001' -or $Parus.modelId -ne 'parus' -or $Parus.source -ne 'OWNER_APPROVED_LANDSCAPE_EDIT_FROM_REAL_PHOTO' -or @($Parus.photos).Count -ne 2){throw 'V72_PARUS_MANIFEST_MISMATCH'}
if(@($Parus.photos | Where-Object { $_.scene -ne 'outside' }).Count -ne 0){throw 'V72_PARUS_SCENE_NOT_OUTSIDE'}
$Tmp=Join-Path $env:TEMP ('gb-v72-build-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -Path $Tmp -ItemType Directory -Force | Out-Null
$HashRows=New-Object System.Collections.Generic.List[object]
function Add-Checked([string]$Relative,[string]$Expected=''){
 $Path=Join-Path $Repo ($Relative -replace '/','\')
 if(!(Test-Path -LiteralPath $Path -PathType Leaf)){throw ('V72_SOURCE_ASSET_MISSING_'+$Relative)}
 $Hash=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
 if($Expected -and $Hash -ne $Expected){throw ('V72_ASSET_SHA_MISMATCH_'+$Relative)}
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
 Add-Checked 'assets/real-objects/viking/viking-001/MEDIA-MANIFEST.json'
 Add-Checked 'assets/real-objects/kvadro-house/kvadro-house-001/MEDIA-MANIFEST.json'
 Add-Checked 'assets/real-objects/parus/parus-001/MEDIA-MANIFEST.json'
 foreach($p in @($Old.photos)){Add-Checked ('assets/media-v5/'+[string]$p.file) ([string]$p.sha256)}
 foreach($p in @($New.images)){Add-Checked ('assets/catalog-v66/'+[string]$p.file) ([string]$p.sha256)}
 foreach($p in @($AI.images)){Add-Checked ('assets/catalog-v68-ai/'+[string]$p.file) ([string]$p.sha256)}
 foreach($p in @($Real.photos)){Add-Checked ([string]$p.path) ([string]$p.sha256)}
 foreach($p in @($House.photos)){Add-Checked ([string]$p.path) ([string]$p.sha256)}
 foreach($p in @($Parus.photos)){Add-Checked ([string]$p.path) ([string]$p.sha256)}
 $Meta=@{sourceSha=$Sha;type='PREVIEW_REVIEW_ONLY_NOT_DEPLOY_INSTALLER';status='CATALOG_DRAFT';staticFiles=$Static.Count;backendFiles=$Server.Count;imagesOld=12;imagesNew=34;imagesAI=7;imagesReal=7;operator='WOODART_GROUP_20261014';brand='DACHA_PAR';objectIds=@('viking-001','kvadro-house-001','parus-001');parusPhotosAreEdited=$true;checksums=$HashRows}
 $Meta | ConvertTo-Json -Depth 12 | Out-File -LiteralPath (Join-Path $Tmp 'GB-V72-RELEASE-MANIFEST.json') -Encoding UTF8
 $Id=$Sha.Substring(0,12)
 $Archive=Join-Path $DestinationDirectory ("GB-V72-review-release-"+$Id+".zip")
 $Sidecar=Join-Path $DestinationDirectory ("GB-V72-review-release-"+$Id+".sha256.txt")
 Compress-Archive -Path (Join-Path $Tmp '*') -DestinationPath $Archive -Force
 $ZipHash=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText($Sidecar,($ZipHash+'  '+(Split-Path -Leaf $Archive)+[Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
 Write-Host ('V72_REVIEW_ZIP='+$Archive)
 Write-Host ('V72_REVIEW_SHA256='+$ZipHash)
 Write-Host ('V72_SOURCE_SHA='+$Sha)
 Write-Host ('V72_FILESET='+$HashRows.Count)
 Write-Host 'V72_BACKEND_IN_BUNDLE=YES'
 Write-Host 'V72_LIVE_SERVER_MUTATIONS=0'
 Write-Host 'V72_REVIEW_BUNDLE=PASS'
}finally{
 if(Test-Path -LiteralPath $Tmp){Remove-Item -LiteralPath $Tmp -Recurse -Force}
}
