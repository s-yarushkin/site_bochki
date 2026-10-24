# DachaPar R8.3.1: guarded editorial / Comfort composition: preflight, stage, browser QA, deploy, status, rollback.
# PINNED to known last VIKING-BUILT production WEB; refused if site changed.
[CmdletBinding()]
param(
 [switch]$Stage,
 [switch]$QA,
 [switch]$Deploy,
 [switch]$Status,
 [switch]$Rollback,
 [string]$StagePath='',
 [string]$QaEvidencePath='',
 [string]$Approval=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$Self=$MyInvocation.MyCommand.Path
$Dir=[IO.Path]::GetDirectoryName($Self)
$Package=Join-Path $Dir 'r83_payload.zip'
$Browser=Join-Path $Dir 'DachaPar_R83_Browser_QA.mjs'
$ExpectedPackage='95bfe1745e3431274740e4b0961c31b70600e7669dc5c6914f9fa2ee90813dc4'
$ExpectedBrowser='936b912f89fbb77bb941cc6c3d83f00657154ff02e97b929f9a81fd71a0d3f7f'
$ExpectedBase='/srv/sites/dachapar-preview/releases/VIKING-BUILT-20261024-1792838766529643617'
$Prefix='/srv/sites/dachapar-preview/releases/CJM-R83-COPY-COMFORT-20261024-'
$Server='deploy@135.106.137.195'
$Opts=@('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
if(@(@($Stage,$QA,$Deploy,$Status,$Rollback) | Where-Object {$_}).Count -gt 1){throw 'R83_ONLY_ONE_MODE_PER_RUN'}
foreach($tool in @('ssh','scp')){Get-Command $tool -ErrorAction Stop | Out-Null}
if(-not (Test-Path -LiteralPath $Package -PathType Leaf)){throw 'R83_PAYLOAD_MISSING'}
if((Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedPackage){throw 'R83_PAYLOAD_SHA_MISMATCH'}
$Mode='preflight'
if($Stage){$Mode='stage'}elseif($QA){$Mode='qa'}elseif($Deploy){$Mode='activate'}elseif($Status){$Mode='status'}elseif($Rollback){$Mode='rollback'}
if($QA -or $Deploy){
 if(-not [regex]::IsMatch($StagePath,'^/srv/sites/dachapar-preview/releases/CJM-R83-COPY-COMFORT-20261024-[0-9]+$')){throw 'R83_STAGE_PATH_REQUIRED_FROM_STAGE_OUTPUT'}
}
$Rtmp='/tmp/dachapar-r83-'+[guid]::NewGuid().ToString('N')
$Ltmp=Join-Path $env:TEMP ('DachaPar_R83_QA_'+[guid]::NewGuid().ToString('N'))
if($Mode -eq 'qa'){
 foreach($cmd in @('node','tar.exe')){Get-Command $cmd -ErrorAction Stop | Out-Null}
 if(-not (Test-Path -LiteralPath $Browser -PathType Leaf)){throw 'R83_BROWSER_SCRIPT_MISSING'}
 if((Get-FileHash -LiteralPath $Browser -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedBrowser){throw 'R83_BROWSER_SCRIPT_SHA_MISMATCH'}
 $major=[int]((& node --version).TrimStart('v').Split('.')[0])
 if($major -lt 22){throw 'R83_NODE_22_REQUIRED'}
 & node --check $Browser
 if($LASTEXITCODE -ne 0){throw 'R83_BROWSER_SYNTAX_INVALID'}
 New-Item -ItemType Directory -Path $Ltmp -Force|Out-Null
 $RemoteTar=$Rtmp+'.tgz'
 try{
  $Code=@'
set -euo pipefail
STAGE="__STAGE__"
BASE="__BASE__"
TAR="__TAR__"
ROOT="/srv/sites/dachapar-preview"
test "$(readlink -f "$ROOT/current")" = "$BASE" || { echo R83_QA_ABORT_LIVE_CHANGED; exit 2; }
test -d "$STAGE" || { echo R83_QA_ABORT_STAGE_MISSING; exit 2; }
test -r "$STAGE.r83-audit.json" || { echo R83_QA_ABORT_AUDIT_NOT_READABLE; exit 2; }
test "$(readlink -f "$STAGE")" != "$BASE" || { echo R83_QA_ABORT_STAGE_IS_LIVE; exit 2; }
tar -C "$STAGE" -czf "$TAR" index.html bani/index.html bani/kvadro/index.html bani/parus/index.html bani/viking/index.html bani/kvadro-haus/index.html voprosy/index.html journal/kak-chitat-komplektatsiyu-bani/index.html
sha256sum "$TAR"
echo R83_QA_REMOTE_ARCHIVE_READY
'@
  $Code=$Code.Replace('__STAGE__',$StagePath).Replace('__BASE__',$ExpectedBase).Replace('__TAR__',$RemoteTar)
  $Code=$Code.Replace("`r`n","`n").Replace("`r",'')
  $Encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Code))
  Write-Host 'R83_QA_MODE=NONLIVE_GET_ONLY; SUDO=0; PROD_POSTS=0; PROD_WRITES=0'
  & ssh @Opts $Server "printf '%s' '$Encoded' | base64 -d | bash"
  if($LASTEXITCODE -ne 0){throw 'R83_QA_REMOTE_STAGE_CHECK_FAILED'}
  $TarFile=Join-Path $Ltmp 'stage.tgz';$AuditFile=Join-Path $Ltmp 'audit.json';$Web=Join-Path $Ltmp 'stage'
  New-Item -ItemType Directory -Path $Web -Force|Out-Null
  & scp @Opts ("{0}:{1}" -f $Server,$RemoteTar) $TarFile
  if($LASTEXITCODE -ne 0){throw 'R83_QA_DOWNLOAD_TAR_FAILED'}
  & scp @Opts ("{0}:{1}.r83-audit.json" -f $Server,$StagePath) $AuditFile
  if($LASTEXITCODE -ne 0){throw 'R83_QA_DOWNLOAD_AUDIT_FAILED'}
  $ArchiveNames=@(& tar.exe -tzf $TarFile)
  if($LASTEXITCODE -ne 0){throw 'R83_QA_BAD_STAGE_ARCHIVE'}
  $Want=@('index.html','bani/index.html','bani/kvadro/index.html','bani/parus/index.html','bani/viking/index.html','bani/kvadro-haus/index.html','voprosy/index.html','journal/kak-chitat-komplektatsiyu-bani/index.html')
  $Actual=@($ArchiveNames|ForEach-Object {$_ -replace '^\./',''})
  $NamesCurrent=(($Actual | Sort-Object) -join '|')
  $NamesWanted=(($Want | Sort-Object) -join '|')
  if($NamesCurrent -cne $NamesWanted){throw 'R83_QA_STAGE_ARCHIVE_FILES_WRONG'}
  & tar.exe -xzf $TarFile -C $Web
  if($LASTEXITCODE -ne 0){throw 'R83_QA_STAGE_UNPACK_FAILED'}
  $Audit=Get-Content -Raw -Encoding UTF8 -LiteralPath $AuditFile|ConvertFrom-Json
  if($Audit.stage -cne $StagePath -or $Audit.source -cne $ExpectedBase){throw 'R83_QA_AUDIT_WRONG_SOURCE'}
  foreach($File in $Want){
   $Hash=(Get-FileHash -LiteralPath (Join-Path $Web ($File -replace '/', [IO.Path]::DirectorySeparatorChar)) -Algorithm SHA256).Hash.ToLowerInvariant()
   $Expected=$Audit.after.PSObject.Properties[$File].Value
   if($Hash -cne $Expected){throw ('R83_QA_STAGE_SHA_MISMATCH='+$File)}
  }
  Write-Host 'R83_STAGE_FILES=PASS; FILES=8; LIVE_UNCHANGED=YES'
  & node $Browser $Web $AuditFile $StagePath
  if($LASTEXITCODE -ne 0){throw 'R83_BROWSER_QA_FAILED_DO_NOT_DEPLOY'}
  Write-Host 'R83_WINDOWS_QA=PASS; PROD_WRITES=0; LIVE_UNCHANGED=YES'
 }finally{
  & ssh @Opts $Server "rm -f '$RemoteTar'" 2>$null|Out-Null
  Remove-Item -LiteralPath $Ltmp -Force -Recurse -ErrorAction SilentlyContinue
 }
 exit 0
}
# All privileged actions use exactly ONE sudo command per invocation.
if($Deploy){
 if($Approval -cne 'R83_COPY_COMFORT_APPROVED'){throw 'R83_DEPLOY_APPROVAL_REQUIRED'}
 if([string]::IsNullOrWhiteSpace($QaEvidencePath)){
  $candidate=Get-ChildItem -Path $env:TEMP -Filter 'DachaPar_R83_Stage_QA_*.json' -File|Sort-Object LastWriteTime -Descending|Select-Object -First 1
  if($null -eq $candidate){throw 'R83_QA_EVIDENCE_NOT_FOUND_RUN_QA_FIRST'}
  $QaEvidencePath=$candidate.FullName
 }
 if(-not (Test-Path -LiteralPath $QaEvidencePath -PathType Leaf)){throw 'R83_QA_EVIDENCE_MISSING'}
 $Evidence=Get-Content -LiteralPath $QaEvidencePath -Raw -Encoding UTF8|ConvertFrom-Json
 if($Evidence.stage -cne $StagePath -or $Evidence.status -cne 'PASS' -or [int]$Evidence.failed -ne 0 -or [int]$Evidence.passed -lt 15 -or [int]$Evidence.productionWrites -ne 0 -or [int]$Evidence.productionPosts -ne 0){throw 'R83_QA_EVIDENCE_INVALID_OR_STALE'}
}
$Ready=$false
try{
 Write-Host ('R83_MODE='+$Mode+'; PUBLIC_SWITCH='+$(if($Deploy){'GUARDED'}else{'NO'})+'; MAX_POSTS=0')
 & ssh @Opts $Server "umask 077 && mkdir -m 700 '$Rtmp'"
 if($LASTEXITCODE -ne 0){throw 'R83_REMOTE_TEMP_FAILED'}
 $Ready=$true
 & scp @Opts $Package ("{0}:{1}/r83_payload.zip" -f $Server,$Rtmp)
 if($LASTEXITCODE -ne 0){throw 'R83_PACKAGE_UPLOAD_FAILED'}
 & ssh @Opts $Server "cd '$Rtmp' && echo '$ExpectedPackage  r83_payload.zip' | sha256sum -c - && python3 -m zipfile -e r83_payload.zip . && python3 -m py_compile transform.py installer.py"
 if($LASTEXITCODE -ne 0){throw 'R83_PACKAGE_VALIDATE_FAILED'}
 if($Deploy){
  & scp @Opts $QaEvidencePath ("{0}:{1}/qa.json" -f $Server,$Rtmp)
  if($LASTEXITCODE -ne 0){throw 'R83_QA_UPLOAD_FAILED'}
  & ssh -tt @Opts $Server "sudo python3 '$Rtmp/installer.py' --mode activate --stage-path '$StagePath' --acceptance-file '$Rtmp/qa.json' --approval R83_COPY_COMFORT_APPROVED"
 } else {
  & ssh -tt @Opts $Server "sudo python3 '$Rtmp/installer.py' --mode $Mode"
 }
 if($LASTEXITCODE -ne 0){throw ('R83_'+$Mode.ToUpperInvariant()+'_FAILED_CHECK_STATUS_BEFORE_RETRY')}
 Write-Host ('R83_WINDOWS_'+$Mode.ToUpperInvariant()+'=PASS; ONE_SUDO_INVOCATION=YES')
}finally{
 if($Ready){& ssh @Opts $Server "rm -rf '$Rtmp'" 2>$null|Out-Null}
}
