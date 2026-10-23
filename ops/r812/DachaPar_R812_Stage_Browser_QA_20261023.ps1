# R8.1.2: exact nonlive stage visual QA. Never posts to production and never changes live WEB.
# This PowerShell launcher is intentionally password-free: only public file reads via SSH/SCP.
[CmdletBinding()]
param(
 [string]$Stage='/srv/sites/dachapar-preview/releases/CJM-R812-VISUAL-SELECT-20261023-1792760695767877252'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ExpectedStage='/srv/sites/dachapar-preview/releases/CJM-R812-VISUAL-SELECT-20261023-1792760695767877252'
$ExpectedLive='/srv/sites/dachapar-preview/releases/CJM-R811-HERO-COPY-20261023-1792759364955844292'
if($Stage -cne $ExpectedStage){ throw 'R812_QA_WRONG_STAGE_PATH' }
$Self=$MyInvocation.MyCommand.Path
if([string]::IsNullOrWhiteSpace($Self)){throw 'R812_QA_SELF_PATH_MISSING'}
$Dir=[IO.Path]::GetDirectoryName($Self)
$BrowserFile=Join-Path $Dir 'DachaPar_R812_Browser_QA.mjs'
$ManifestFile=Join-Path $Dir 'manifest.json'
$ExpectedBrowserSha='669b01c22e868d55c4174a30593b6c6934dfa97bdbd979db3dc438e453ecf016'
$ExpectedManifestSha='77a56fb426dda619e09e08cb22af0a45ad8ed6f4802e89d3f0c8d4342291563a'
foreach($p in @($BrowserFile,$ManifestFile)){ if(-not (Test-Path -LiteralPath $p -PathType Leaf)){throw ('R812_QA_MISSING_FILE='+$p)} }
if((Get-FileHash $BrowserFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedBrowserSha){throw 'R812_QA_BROWSER_SCRIPT_SHA_MISMATCH'}
if((Get-FileHash $ManifestFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedManifestSha){throw 'R812_QA_MANIFEST_SHA_MISMATCH'}
foreach($tool in @('ssh','scp','node','tar.exe')){Get-Command $tool -ErrorAction Stop | Out-Null}
$major=[int]((& node --version).TrimStart('v').Split('.')[0]);if($major -lt 22){throw 'R812_QA_REQUIRES_NODE_22_OR_NEWER'}
& node --check $BrowserFile
if($LASTEXITCODE -ne 0){throw 'R812_QA_JS_SYNTAX_FAILED'}
$manifest=Get-Content -LiteralPath $ManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if($manifest.expected_active_release -cne [IO.Path]::GetFileName($ExpectedLive)){throw 'R812_QA_WRONG_BASE'}
if(@($manifest.modified.PSObject.Properties.Name).Count -ne 3){throw 'R812_QA_WRONG_CHANGE_COUNT'}
$Server='deploy@135.106.137.195'
$Opts=@('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
$Random=[guid]::NewGuid().ToString('N')
$Remote="/tmp/dachapar-r812-qa-$Random.tgz"
$Local=Join-Path $env:TEMP ("DachaPar_R812_Stage_QA_"+$Random)
$StageFiles=Join-Path $Local 'stage'
$Archive=Join-Path $Local 'stage.tgz'
New-Item -ItemType Directory -Path $StageFiles -Force | Out-Null
try{
 $Bash=@'
set -euo pipefail
STAGE="__STAGE__"
LIVE="__LIVE__"
ARCH="__ARCH__"
test "$(readlink -f /srv/sites/dachapar-preview/current)" = "$LIVE" || { echo R812_QA_ABORT_LIVE_POINTER_CHANGED; exit 2; }
test -d "$STAGE" || { echo R812_QA_ABORT_STAGE_MISSING; exit 2; }
test -f "$STAGE.r812-audit.json" || { echo R812_QA_ABORT_AUDIT_MISSING; exit 2; }
test -f "$STAGE/index.html" && test -f "$STAGE/bani/index.html" && test -f "$STAGE/compare/index.html"
if test "$(readlink -f "$STAGE")" = "$LIVE"; then echo R812_QA_ABORT_STAGE_IS_LIVE; exit 2; fi
tar -C "$STAGE" -czf "$ARCH" index.html bani/index.html compare/index.html
sha256sum "$ARCH"
echo R812_QA_REMOTE_ARCHIVE_READY
'@
 $Bash=$Bash.Replace('__STAGE__',$ExpectedStage).Replace('__LIVE__',$ExpectedLive).Replace('__ARCH__',$Remote)
 $Bash=$Bash.Replace("`r`n","`n").Replace("`r",'')
 if($Bash.Contains("`r")){throw 'R812_QA_REMOTE_CR_REMAINS'}
 $Encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Bash))
 Write-Host 'R812_QA_MODE=STAGE_READ_ONLY; PRODUCTION_POSTS=0; PRODUCTION_WRITES=0; SUDO_INVOCATIONS=0'
 & ssh @Opts $Server "printf '%s' '$Encoded' | base64 -d | bash"
 if($LASTEXITCODE -ne 0){throw 'R812_QA_REMOTE_SOURCE_OR_AUDIT_DRIFT'}
 & scp @Opts ("{0}:{1}" -f $Server,$Remote) $Archive
 if($LASTEXITCODE -ne 0){throw 'R812_QA_SCP_ARCHIVE_FAILED'}
 & ssh @Opts $Server "rm -f '$Remote'"
 if($LASTEXITCODE -ne 0){Write-Warning 'R812_QA_REMOTE_ARCHIVE_CLEANUP_WARNING'}
 $Listed=@(& tar.exe -tzf $Archive)
 if($LASTEXITCODE -ne 0){throw 'R812_QA_INVALID_REMOTE_ARCHIVE'}
 $Listed=@($Listed | ForEach-Object {$_ -replace '^\./',''})
 $Want=@('index.html','bani/index.html','compare/index.html')
 if((@($Listed | Sort-Object) -join '|') -cne (@($Want | Sort-Object) -join '|')){throw ('R812_QA_ARCHIVE_INVENTORY_ERROR='+($Listed -join ','))}
 & tar.exe -xzf $Archive -C $StageFiles
 if($LASTEXITCODE -ne 0){throw 'R812_QA_ARCHIVE_EXTRACT_FAILED'}
 foreach($name in $Want){
    $meta=$manifest.modified.PSObject.Properties[$name].Value
    $p=Join-Path $StageFiles ($name -replace '/', [IO.Path]::DirectorySeparatorChar)
    $actual=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actual -cne $meta.after_sha256){throw ('R812_QA_STAGE_SHA_MISMATCH='+$name)}
 }
 Write-Host 'R812_QA_STAGE_FILES=PASS; COUNT=3; R811_STILL_LIVE=YES'
 & node $BrowserFile $StageFiles $ManifestFile ([IO.Path]::GetFileName($ExpectedStage))
 $Result=$LASTEXITCODE
 Write-Host "R812_QA_WINDOWS_EXIT=$Result; PRODUCTION_POSTS=0; PRODUCTION_WRITES=0"
 if($Result -ne 0){throw 'R812_QA_NO_GO; REVIEW_JSON_AND_SCREENSHOTS; DO_NOT_DEPLOY'}
 Write-Host 'R812_QA_STAGE_BROWSER=PASS; PUBLIC_SITE_SWITCH=NO'
}finally{
 if(Test-Path -LiteralPath $Local){Remove-Item -LiteralPath $Local -Recurse -Force -ErrorAction SilentlyContinue}
}
