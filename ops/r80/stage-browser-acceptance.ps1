# R8.0 real staged HTML test: no production changes, only reads staged WEB files.
# Uses SSH/SCP for staged 9 files; local Chrome/Edge for GET-only browser QA.
param(
  [string]$Stage='/srv/sites/dachapar-preview/releases/CJM-R80-20261022-1792731611547801280',
  [string]$BrowserTest=(Join-Path $PSScriptRoot 'DachaPar_R80_Stage_Browser_Acceptance.mjs')
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ExpectedStage='/srv/sites/dachapar-preview/releases/CJM-R80-20261022-1792731611547801280'
$ExpectedPrevious='/srv/sites/dachapar-preview/releases/GALLERY-UNIFIED-20261022-parus-qh-v1-1792680175428407103'
$ExpectedScriptSHA='30d74fc807c6fd654897e3da551e0171dc848d4cd9c638ddfe439d71ef562917'
$Server='deploy@135.106.137.195'
$Options=@('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
if($Stage -ne $ExpectedStage){throw 'R80_WRONG_STAGE_PATH'}
if(-not (Test-Path -LiteralPath $BrowserTest -PathType Leaf)){throw 'R80_TEST_NOT_FOUND'}
if((Get-FileHash -LiteralPath $BrowserTest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedScriptSHA){throw 'R80_BROWSER_TEST_SHA_MISMATCH'}
foreach($command in @('node','ssh','scp','tar.exe')){Get-Command $command -ErrorAction Stop | Out-Null}
$major=[int]((& node --version).TrimStart('v').Split('.')[0])
if($major -lt 22){throw "R80_NODE_22_REQUIRED=$major"}
& node --check $BrowserTest
if($LASTEXITCODE -ne 0){throw 'R80_BROWSER_TEST_SYNTAX_FAILED'}
$files=@('index.html','bani/kvadro/index.html','bani/viking/index.html','bani/parus/index.html','bani/kvadro-haus/index.html','sitemap.xml','raboty/index.html','cjm-r80.css','cjm-r80-model.mjs')
$random=[guid]::NewGuid().ToString('N')
$remote="/tmp/dachapar-r80-stage-browser-$random.tgz"
$local=Join-Path $env:TEMP "DachaPar-R80-Browser-$random"
$archive=Join-Path $local 'stage.tgz'
$unpacked=Join-Path $local 'stage'
New-Item -ItemType Directory -Path $unpacked -Force | Out-Null
try {
  # Verify production symlink still points to the known previous WEB release.
  # Archive is made from the non-live stage ONLY; API and current WEB are untouched.
  $remoteCmd=('set -eu; test $(readlink -f /srv/sites/dachapar-preview/current) = {0}; test -d {1}; tar -C {1} -czf {2} {3}; sha256sum {2}' -f $ExpectedPrevious,$Stage,$remote,($files -join ' '))
  Write-Host 'R80_STAGE_DOWNLOAD=BEGIN; MODE=READ_ONLY; PUBLIC_SITE_SWITCH=NO'
  & ssh @Options $Server $remoteCmd
  if($LASTEXITCODE -ne 0){throw 'R80_STAGE_ARCHIVE_REMOTE_FAILED'}
  & scp @Options ("{0}:{1}" -f $Server,$remote) $archive
  if($LASTEXITCODE -ne 0){throw 'R80_STAGE_ARCHIVE_DOWNLOAD_FAILED'}
  & ssh @Options $Server "rm -f $remote"
  if($LASTEXITCODE -ne 0){Write-Host 'R80_REMOTE_TEMP_CLEANUP=WARNING'}
  $present=@(& tar.exe -tzf $archive)
  if($LASTEXITCODE -ne 0){throw 'R80_STAGE_ARCHIVE_INVALID'}
  $present=@($present | ForEach-Object {$_ -replace '^\./',''})
  $missing=@($files | Where-Object {$_ -notin $present})
  $extra=@($present | Where-Object {$_ -notin $files})
  if($missing.Count -or $extra.Count){throw "R80_UNEXPECTED_STAGE_FILES missing=$($missing -join ',') extra=$($extra -join ',')"}
  & tar.exe -xzf $archive -C $unpacked
  if($LASTEXITCODE -ne 0){throw 'R80_STAGE_ARCHIVE_EXTRACT_FAILED'}
  $digest=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "R80_STAGE_ARCHIVE=VERIFIED; FILES=9; SHA256=$digest; PUBLIC_SITE_SWITCH=NO"
  & node $BrowserTest $unpacked
  $exit=$LASTEXITCODE
  Write-Host "R80_WINDOWS_BROWSER_EXIT=$exit; PRODUCTION_WRITES=0"
  if($exit -ne 0){throw 'R80_BROWSER_ACCEPTANCE_NO_GO'}
  Write-Host 'R80_WINDOWS_STAGE_ACCEPTANCE=PASS; PUBLIC_SITE_SWITCH=NO; PRODUCTION_WRITES=0'
}
finally {
  if(Test-Path -LiteralPath $local){Remove-Item -LiteralPath $local -Recurse -Force -ErrorAction SilentlyContinue}
}
