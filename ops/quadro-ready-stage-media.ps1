# Local-only upload of the owner-approved 2026-10-14 photographs.
# Does not connect to the server, change git refs, or trigger deployment.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [string]$RepositoryRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ExpectedZipSha256='ca0c02fa89eebe64edcbcfe66379258b291c247c1e5513d23d786633c9fe4c20'
$Archive=(Resolve-Path -LiteralPath $Archive).Path
$Actual=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
if($Actual -ne $ExpectedZipSha256){throw 'QUADRO_MEDIA_ARCHIVE_SHA256_MISMATCH'}
Add-Type -AssemblyName System.IO.Compression
$zip=[System.IO.Compression.ZipFile]::OpenRead($Archive)
$staging=Join-Path $env:TEMP ('quadro-media-stage-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force|Out-Null
try{
  $allowed=@('hero-side','full-side','side-perspective','end-window','lounge','steam-wide',
    'steam-shelves','stove-tank','stove-wide','firebox','drain','exterior-proof')
  $expected=@('media-manifest.json')+@($allowed|ForEach-Object{'media/'+$_+'.webp'})
  $seen=@{}
  foreach($entry in $zip.Entries){
    $name=$entry.FullName
    if($name.Contains('\') -or $name.StartsWith('/') -or $name.Contains('..') -or
      -not ($expected -ccontains $name) -or $seen.ContainsKey($name)){
      throw ('UNSAFE_OR_DUPLICATE_MEDIA_ENTRY_'+$name)
    }
    $seen[$name]=$true
  }
  if($seen.Count -ne $expected.Count){throw 'QUADRO_MEDIA_ARCHIVE_ENTRIES_MISMATCH'}
  $manifestEntry=$zip.GetEntry('media-manifest.json')
  $sr=New-Object System.IO.StreamReader($manifestEntry.Open(),[Text.Encoding]::UTF8)
  try{$manifest=$sr.ReadToEnd()|ConvertFrom-Json}finally{$sr.Dispose()}
  foreach($item in $allowed){
    $path='media/'+$item+'.webp'
    if($manifest.assets.$item.path -ne $path){throw ('QUADRO_MEDIA_MANIFEST_PATH_'+$item)}
    $target=Join-Path $staging ($item+'.webp')
    $entry=$zip.GetEntry($path)
    $src=$entry.Open()
    $dst=[IO.File]::Open($target,[IO.FileMode]::CreateNew)
    try{$src.CopyTo($dst)}finally{$src.Dispose();$dst.Dispose()}
    $sha=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if($sha -ne $manifest.assets.$item.sha256){throw ('QUADRO_MEDIA_FILE_SHA256_'+$item)}
  }
  $dest=Join-Path $RepositoryRoot 'quadro-ready\media'
  if(!(Test-Path $dest)){New-Item -ItemType Directory -Path $dest|Out-Null}
  foreach($item in $allowed){
    $target=Join-Path $dest ($item+'.webp')
    if(Test-Path -LiteralPath $target){throw ('QUADRO_MEDIA_TARGET_EXISTS_'+$item)}
  }
  foreach($item in $allowed){
    Copy-Item -LiteralPath (Join-Path $staging ($item+'.webp')) -Destination (Join-Path $dest ($item+'.webp'))
  }
  Write-Host ('QUADRO_MEDIA_STAGE=PASS files='+$allowed.Count)
  Write-Host 'DEPLOY=NOT_RUN'
  Write-Host 'NEXT=Review photos, commit desired files, run npm run check, deploy to protected preview only'
}finally{
  $zip.Dispose()
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
