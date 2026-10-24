# DachaPar R8.3 stage only. Based on exact active Viking WEB. One sudo/SSH per invocation.
[CmdletBinding()]
param([switch]$Stage)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$Self=$MyInvocation.MyCommand.Path
if([string]::IsNullOrWhiteSpace($Self)){throw 'R83_SELF_PATH_MISSING'}
$Directory=[IO.Path]::GetDirectoryName($Self)
$Payload=Join-Path $Directory 'r83_payload.zip'
if(-not (Test-Path -LiteralPath $Payload -PathType Leaf)){throw 'R83_PAYLOAD_NOT_FOUND'}
$Expected='04ec103d4a5599d6e9b668984e8c10c5b086e9b7ad32913debaa494952763d94'
$Got=(Get-FileHash -LiteralPath $Payload -Algorithm SHA256).Hash.ToLowerInvariant()
if($Got -cne $Expected){throw ('R83_LOCAL_SHA_MISMATCH='+$Got)}
foreach($name in @('ssh','scp')){Get-Command $name -ErrorAction Stop | Out-Null}
$Server='deploy@135.106.137.195'
$Opts=@('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
$Tmp='/tmp/dachapar-r83-'+[guid]::NewGuid().ToString('N')
$Mode='preflight';if($Stage){$Mode='stage'}
$Ready=$false
try{
 Write-Host ('R83_MODE='+$Mode+'; PRODUCTION_SWITCH=NO; API_WRITES=0; MAX_POSTS=0')
 & ssh @Opts $Server "umask 077 && mkdir -m 700 '$Tmp'"
 if($LASTEXITCODE -ne 0){throw 'R83_TEMP_CREATE_FAILED'}
 $Ready=$true
 & scp @Opts $Payload ("{0}:{1}/r83_payload.zip" -f $Server,$Tmp)
 if($LASTEXITCODE -ne 0){throw 'R83_SCP_FAILED'}
 & ssh @Opts $Server "cd '$Tmp' && echo '$Expected  r83_payload.zip' | sha256sum -c - && python3 -m zipfile -e r83_payload.zip . && python3 -m py_compile transform.py installer.py"
 if($LASTEXITCODE -ne 0){throw 'R83_PAYLOAD_INVALID'}
 & ssh -tt @Opts $Server "sudo python3 '$Tmp/installer.py' --mode $Mode"
 if($LASTEXITCODE -ne 0){throw ('R83_'+$Mode.ToUpperInvariant()+'_FAILED')}
 Write-Host ('R83_WINDOWS_'+$Mode.ToUpperInvariant()+'=PASS; ONE_SUDO_INVOCATION=YES; LIVE_SWITCH=NO')
} finally {
 if($Ready){& ssh @Opts $Server "rm -rf '$Tmp'" 2>$null | Out-Null}
}
