param([ValidateSet('Check','Stage','Apply')][string]$Mode='Check')
$ErrorActionPreference='Stop'
$taskReleaseDir=$PSScriptRoot
$taskManifest=Get-Content -LiteralPath (Join-Path $taskReleaseDir 'manifest.json') -Raw | ConvertFrom-Json
if($taskManifest.release -notmatch '^R100-CRO-[a-f0-9]{12}$'){throw 'Invalid release name'}
$taskPayload=Join-Path $taskReleaseDir 'payload.zip'
if((Get-FileHash -LiteralPath $taskPayload -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskManifest.payloadSha256){throw 'Payload checksum mismatch'}
$taskRemote='/tmp/dachapar-'+$taskManifest.release
$taskDestination='deploy@135.106.137.195'
ssh -o ConnectTimeout=10 $taskDestination "mkdir -p '$taskRemote'"
if($LASTEXITCODE -ne 0){throw 'SSH connection failed'}
scp (Join-Path $taskReleaseDir 'manifest.json') $taskPayload (Join-Path $taskReleaseDir 'r100-remote.py') "${taskDestination}:$taskRemote/"
if($LASTEXITCODE -ne 0){throw 'Upload failed'}
if($Mode -eq 'Check'){
 ssh $taskDestination "python3 '$taskRemote/r100-remote.py' --check"
}else{
 $taskFlag=if($Mode -eq 'Stage'){'--stage'}else{'--apply'}
 # sudo reads the password in the user's terminal; it is never stored in this script.
 ssh -t $taskDestination "sudo python3 '$taskRemote/r100-remote.py' $taskFlag"
}
if($LASTEXITCODE -ne 0){throw 'Release stopped; inspect the message above. The installer refuses changed baselines.'}
