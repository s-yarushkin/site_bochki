# R8.1.2 — guarded WEB-only visual comparison patch; no GitHub Actions/DC.
# Default preflight (read-only), -Stage creates nonlive stage, -Deploy activates explicitly supplied stage, -Rollback returns to R8.1.1.
[CmdletBinding()]
param(
    [switch]$Stage,
    [switch]$Deploy,
    [switch]$Rollback,
    [switch]$Status,
    [string]$StagePath = '',
    [string]$Approval = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$count=0
foreach ($flag in @($Stage.IsPresent,$Deploy.IsPresent,$Rollback.IsPresent,$Status.IsPresent)) { if($flag){$count++} }
if($count -gt 1){throw 'R812_MUTUALLY_EXCLUSIVE_FLAGS'}
$Mode='preflight';if($Stage){$Mode='stage'};if($Deploy){$Mode='activate'};if($Rollback){$Mode='rollback'};if($Status){$Mode='status'}
if($Deploy){
  if($Approval -cne 'R812_VISUAL_COMPARE_APPROVED'){throw 'R812_EXPLICIT_APPROVAL_REQUIRED'}
  if($StagePath -notmatch '^/srv/sites/dachapar-preview/releases/CJM-R812-VISUAL-SELECT-20261023-[0-9]+$'){throw 'R812_INVALID_STAGE_PATH'}
}elseif($StagePath -ne '' -or $Approval -ne ''){throw 'R812_NO_STAGE_OR_APPROVAL_WITHOUT_DEPLOY'}
$Self=$MyInvocation.MyCommand.Path
if([string]::IsNullOrWhiteSpace($Self)){throw 'R812_SCRIPT_SELF_PATH_MISSING'}
$Dir=[IO.Path]::GetDirectoryName($Self)
$Payload=Join-Path $Dir 'r812_payload.zip'
if(-not (Test-Path -LiteralPath $Payload -PathType Leaf)){throw 'R812_MISSING_PAYLOAD'}
$ExpectedHash='64d45940f0c4761fac06ce1a3b93180cdeb040128097adf99bcb6c81cc60dbf2'
$ActualHash=(Get-FileHash -LiteralPath $Payload -Algorithm SHA256).Hash.ToLowerInvariant()
if($ActualHash -cne $ExpectedHash){throw ('R812_PAYLOAD_HASH_MISMATCH='+$ActualHash)}
foreach ($tool in @('ssh','scp')){Get-Command $tool -ErrorAction Stop | Out-Null}
$Server='deploy@135.106.137.195'
$SshOptions=@('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
$Tmp='/tmp/dachapar-r812-'+[guid]::NewGuid().ToString('N')
$Ready=$false
try{
 Write-Host ('R812_MODE='+$Mode+'; WEB_ONLY=YES; CHANGED_FILES=3; PUBLIC_POSTS=0')
 & ssh @SshOptions $Server "umask 077 && mkdir -m 700 '$Tmp'"
 if($LASTEXITCODE -ne 0){throw 'R812_REMOTE_TEMP_CREATE_FAILED'}
 $Ready=$true
 & scp @SshOptions $Payload ("{0}:{1}/r812_payload.zip" -f $Server,$Tmp)
 if($LASTEXITCODE -ne 0){throw 'R812_SCP_FAILED'}
 & ssh @SshOptions $Server "cd '$Tmp' && echo '$ExpectedHash  r812_payload.zip' | sha256sum -c - && python3 -m zipfile -e r812_payload.zip . && python3 -m py_compile installer.py"
 if($LASTEXITCODE -ne 0){throw 'R812_REMOTE_PACKAGE_INVALID'}
 $Command="sudo python3 '$Tmp/installer.py' --mode $Mode"
 if($Deploy){$Command += " --stage-path '$StagePath'"}
 & ssh -tt @SshOptions $Server $Command
 if($LASTEXITCODE -ne 0){
   if($Deploy){Write-Warning 'R812_DEPLOY_UNCERTAIN_OR_FAILED; DO NOT REPEAT; CHECK -Status BEFORE ANY ACTION'}
   throw ('R812_'+$Mode.ToUpperInvariant()+'_FAILED')
 }
 Write-Host ('R812_WINDOWS_'+$Mode.ToUpperInvariant()+'=PASS; ONE_SUDO_INVOCATION=YES')
}finally{
 if($Ready){& ssh @SshOptions $Server "rm -rf '$Tmp'" 2>$null | Out-Null}
}
