# R8.1 FIX4 exact-SHA acceptance — manifest aligned with server FIX2 overlay. Strict PASS semantics, no real lead POST.
# Supply the exact new R8.1 stage path printed by -Stage (not the old R8.1 stage).
# SSH stage reads + local GET mirror + 127.0.0.1 mock API; NO production POST, NO deploy.
param(
 [Parameter(Mandatory=$true)][string]$Stage,
 [string]$BrowserTest,
 [string]$ManifestPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
# Windows PowerShell 5.1 may not initialize $PSScriptRoot when evaluating param defaults.
# Resolve siblings only after script invocation begins; allow explicit overrides.
$ScriptFile=$MyInvocation.MyCommand.Path
if([string]::IsNullOrWhiteSpace($ScriptFile)) { throw 'R81_TEST_WRAPPER_PATH_UNAVAILABLE' }
$ScriptDirectory=[IO.Path]::GetDirectoryName($ScriptFile)
if([string]::IsNullOrWhiteSpace($BrowserTest)) {
  $BrowserTest=Join-Path -Path $ScriptDirectory -ChildPath 'DachaPar_R81_Browser_42.mjs'
}
if([string]::IsNullOrWhiteSpace($ManifestPath)) {
  $ManifestPath=Join-Path -Path $ScriptDirectory -ChildPath 'manifest.json'
}
$ExpectedStagePattern='^/srv/sites/dachapar-preview/releases/CJM-R81-20261023-[0-9]{10,22}$'
$ExpectedLive='/srv/sites/dachapar-preview/releases/CJM-R80-20261022-1792731611547801280'
$Server='deploy@135.106.137.195'
$Opts=@('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
$ExpectedBrowserSha='845c483eaf3183552242d788d5ba25d82681bccbafee154bff63ec7a341db4bd'
$ExpectedManifestSha='4d2646abba5ebb8aabefb88d713f196fb7d51691c6ab176f8b3dbc77f0ea8858'
if($Stage -cnotmatch $ExpectedStagePattern){throw 'R81_WRONG_NONLIVE_STAGE'}
if(-not (Test-Path -LiteralPath $BrowserTest -PathType Leaf)){throw 'R81_BROWSER_SCRIPT_MISSING'}
if(-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)){throw 'R81_MANIFEST_MISSING'}
if((Get-FileHash -LiteralPath $BrowserTest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedBrowserSha){throw 'R81_BROWSER_SCRIPT_SHA_MISMATCH'}
if((Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedManifestSha){throw 'R81_MANIFEST_SHA_MISMATCH'}
foreach($tool in @('node','ssh','scp','tar.exe')){Get-Command $tool -ErrorAction Stop | Out-Null}
$major=[int]((& node --version).TrimStart('v').Split('.')[0])
if($major -lt 22){throw "R81_NODE_22_REQUIRED=$major"}
& node --check $BrowserTest
if($LASTEXITCODE -ne 0){throw 'R81_BROWSER_JS_SYNTAX_ERROR'}
$manifest=Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$files=@($manifest.modified_files.PSObject.Properties.Name | Sort-Object)
if($files.Count -ne 64){throw "R81_STAGE_MANIFEST_EXPECTED_64_ACTUAL=$($files.Count)"}
foreach($p in $files){if($p -notmatch '^[a-zA-Z0-9_.\-/]+$' -or $p.Contains('..')){throw 'R81_UNSAFE_STAGE_FILE_NAME'}}
$random=[guid]::NewGuid().ToString('N')
$remote="/tmp/dachapar-r81-browser-$random.tgz"
$local=Join-Path $env:TEMP "DachaPar-R81-Browser-$random"
$archive=Join-Path $local 'stage.tgz'
$unpacked=Join-Path $local 'stage'
New-Item -ItemType Directory -Path $unpacked -Force | Out-Null
try {
  # Base64 carries all shell quoting safely through Windows OpenSSH.
  $script=@'
set -euo pipefail
STAGE="__STAGE__"
LIVE="__LIVE__"
ARCH="__ARCH__"
test "$(readlink -f /srv/sites/dachapar-preview/current)" = "$LIVE" || { echo R81_BROWSER_ABORT_LIVE_DRIFT; exit 2; }
test -d "$STAGE" && test -e "$STAGE.r81-audit.json"
# Root-owned audit is intentionally 0600; do not attempt to read it as deploy.
echo 'R81_STAGE_AUDIT_PRESENT=YES; EXACT_FILE_SHAS_CHECKED_LOCALLY=64; STAGE_NOT_LIVE=YES'
tar -C "$STAGE" -czf "$ARCH" __FILES__
sha256sum "$ARCH"
'@
 $script=$script.Replace('__STAGE__',$Stage).Replace('__LIVE__',$ExpectedLive).Replace('__ARCH__',$remote).Replace('__FILES__',($files -join ' '))
 $b64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
 Write-Host 'R81_BROWSER_STAGE_FETCH=BEGIN; NONLIVE=YES; GET_ONLY=YES; NO_PRODUCTION_POST'
 & ssh @Opts $Server "printf '%s' '$b64' | base64 -d | bash"
 if($LASTEXITCODE -ne 0){throw 'R81_STAGE_REMOTE_READ_OR_SOURCE_DRIFT'}
 & scp @Opts ("{0}:{1}" -f $Server,$remote) $archive
 if($LASTEXITCODE -ne 0){throw 'R81_STAGE_ARCHIVE_SCP_FAILED'}
 & ssh @Opts $Server "rm -f '$remote'"
 if($LASTEXITCODE -ne 0){Write-Host 'R81_REMOTE_TEMP_CLEANUP=WARNING'}
 $present=@(& tar.exe -tzf $archive)
 if($LASTEXITCODE -ne 0){throw 'R81_STAGE_ARCHIVE_INVALID'}
 $present=@($present | ForEach-Object {$_ -replace '^\./',''})
 $missing=@($files | Where-Object {$_ -notin $present})
 $extra=@($present | Where-Object {$_ -notin $files})
 if($missing.Count -or $extra.Count){throw "R81_ARCHIVE_INVENTORY_MISMATCH missing=$($missing -join ',') extra=$($extra -join ',')"}
 & tar.exe -xzf $archive -C $unpacked
 if($LASTEXITCODE -ne 0){throw 'R81_STAGE_EXTRACT_FAILED'}
 Write-Host "R81_STAGE_ARCHIVE=VERIFIED; FILES=$($files.Count); SHA256=$((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant())"
 & node $BrowserTest $unpacked $ManifestPath ([IO.Path]::GetFileName($Stage))
 $exit=$LASTEXITCODE
 Write-Host "R81_WINDOWS_STAGE_BROWSER_EXIT=$exit; PRODUCTION_WRITES=0"
 if($exit -ne 0){throw 'R81_42QA_NO_GO; REVIEW_QA_EVIDENCE; DO_NOT_DEPLOY'}
 Write-Host 'R81_WINDOWS_42QA=PASS; ALL_42=PASS; PUBLIC_SITE_SWITCH=NO'
}
finally {
 if(Test-Path -LiteralPath $local){Remove-Item -LiteralPath $local -Recurse -Force -ErrorAction SilentlyContinue}
}
