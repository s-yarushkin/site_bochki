param(
    [ValidateSet('Check','Stage','Apply','Rollback')][string]$Mode='Check',
    [string]$RollbackState=''
)
$ErrorActionPreference='Stop'
$remote='deploy@135.106.137.195'
$base=Split-Path -Parent $MyInvocation.MyCommand.Path
if($Mode -eq 'Rollback'){
    if($RollbackState -notmatch '^/var/backups/dachapar/DPQUIZ-[a-f0-9]{12}/state\.json$'){throw 'RollbackState must be the exact path printed after Apply'}
    ssh -o ConnectTimeout=10 -t $remote "sudo python3 '/tmp/dachapar-$($RollbackState.Split('/')[4])/quiz-v1-remote.py' --rollback '$RollbackState'"
    if($LASTEXITCODE -ne 0){throw "Rollback failed. Do not overwrite the database; inspect production manually."}
    exit 0
}
$manifest=Get-Content (Join-Path $base 'manifest.json') -Raw | ConvertFrom-Json
if($manifest.release -notmatch '^DPQUIZ-[0-9a-f]{12}$'){throw 'Invalid release ID'}
$payload=Join-Path $base 'payload.zip'
if(-not (Test-Path $payload)){throw 'Release payload is missing'}
if((Get-FileHash $payload -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.payloadSha256){throw 'Release payload checksum does not match manifest'}
$remoteDir='/tmp/dachapar-'+$manifest.release
ssh -o ConnectTimeout=10 $remote "mkdir -p '$remoteDir'"
if($LASTEXITCODE -ne 0){throw 'SSH unavailable — production not changed'}
scp -o ConnectTimeout=10 (Join-Path $base 'manifest.json') $payload (Join-Path $base 'quiz-v1-remote.py') "${remote}:$remoteDir/"
if($LASTEXITCODE -ne 0){throw 'Secure upload failed — production not changed'}
if($Mode -eq 'Check'){
    ssh -o ConnectTimeout=10 $remote "python3 '$remoteDir/quiz-v1-remote.py' --check"
}else{
    $flag=if($Mode -eq 'Stage'){'--stage'}else{'--apply'}
    ssh -o ConnectTimeout=10 -t $remote "sudo python3 '$remoteDir/quiz-v1-remote.py' $flag"
}
if($LASTEXITCODE -ne 0){throw 'Deployment guard stopped. Do not bypass release SHA/version checks.'}
