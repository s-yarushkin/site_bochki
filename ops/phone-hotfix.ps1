param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Run=Join-Path $env:TEMP ('DachaPar-Phone-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Run | Out-Null
$Base="https://raw.githubusercontent.com/s-yarushkin/site_bochki/$SourceSha/"
Invoke-WebRequest -UseBasicParsing ($Base+'ops/phone-hotfix-manifest.json') -OutFile (Join-Path $Run 'manifest.json')
$Manifest=Get-Content -Raw (Join-Path $Run 'manifest.json') | ConvertFrom-Json
$Files=@($Manifest.baseline.PSObject.Properties.Name)+@('ops/phone-hotfix-manifest.json','ops/phone-hotfix-install.py')
$Checks=New-Object System.Collections.Generic.List[string]
foreach($Name in $Files){
 $Dest=Join-Path $Run $Name
 New-Item -ItemType Directory -Force -Path (Split-Path $Dest) | Out-Null
 Invoke-WebRequest -UseBasicParsing ($Base+$Name) -OutFile $Dest
 $Checks.Add((Get-FileHash -Algorithm SHA256 $Dest).Hash.ToLowerInvariant()+'  '+$Name)
}
[IO.File]::WriteAllLines((Join-Path $Run 'SHA256SUMS'),$Checks,(New-Object Text.UTF8Encoding($false)))
$Package=Join-Path $env:TEMP ('DachaPar-Phone-'+[guid]::NewGuid().ToString('N')+'.tar.gz')
& tar -czf $Package -C $Run .
if($LASTEXITCODE -ne 0){throw 'PACKAGE_FAILED'}
$Hash=(Get-FileHash -Algorithm SHA256 $Package).Hash.ToLowerInvariant()
$Remote='/tmp/dachapar-phone-'+[guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 deploy@135.106.137.195 "umask 077 && mkdir '$Remote'"
if($LASTEXITCODE -ne 0){throw 'SSH_FAILED'}
& scp $Package "deploy@135.106.137.195:$Remote/source.tar.gz"
if($LASTEXITCODE -ne 0){throw 'SCP_FAILED'}
& ssh deploy@135.106.137.195 "cd '$Remote' && printf '%s  source.tar.gz\n' '$Hash' | sha256sum -c - && mkdir source && tar -xzf source.tar.gz -C source && cd source && sha256sum -c SHA256SUMS"
if($LASTEXITCODE -ne 0){throw 'TRANSFER_FAILED'}
& ssh -t deploy@135.106.137.195 "sudo python3 '$Remote/source/ops/phone-hotfix-install.py' --source '$Remote/source' --source-sha '$SourceSha'"
if($LASTEXITCODE -ne 0){throw 'PHONE_HOTFIX_STOPPED'}
