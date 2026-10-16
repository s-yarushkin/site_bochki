param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Run=Join-Path $env:TEMP ('DachaPar-Contact-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Run | Out-Null
$Files=@('privacy.html','requisites.html','ops/v72-contact-install.py')
$Checks=New-Object System.Collections.Generic.List[string]
foreach($Name in $Files){
 $Leaf=Split-Path -Leaf $Name
 $File=Join-Path $Run $Leaf
 Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/s-yarushkin/site_bochki/$SourceSha/$Name" -OutFile $File
 $Hash=(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
 $Checks.Add($Hash+'  '+$Leaf)
}
[IO.File]::WriteAllLines((Join-Path $Run 'SHA256SUMS'),$Checks,(New-Object Text.UTF8Encoding($false)))
$Remote='/tmp/dachapar-contact-'+[guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 deploy@135.106.137.195 "umask 077 && mkdir '$Remote'"
if($LASTEXITCODE -ne 0){throw 'SSH_FAILED'}
foreach($Name in @('privacy.html','requisites.html','v72-contact-install.py','SHA256SUMS')){
 & scp (Join-Path $Run $Name) "deploy@135.106.137.195:$Remote/$Name"
 if($LASTEXITCODE -ne 0){throw 'SCP_FAILED'}
}
& ssh deploy@135.106.137.195 "cd '$Remote' && sha256sum -c SHA256SUMS"
if($LASTEXITCODE -ne 0){throw 'TRANSFER_HASH_FAILED'}
& ssh -t deploy@135.106.137.195 "sudo python3 '$Remote/v72-contact-install.py' --directory '$Remote' --source-sha '$SourceSha'"
if($LASTEXITCODE -ne 0){throw 'CONTACT_UPDATE_STOPPED'}
