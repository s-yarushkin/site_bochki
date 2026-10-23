param(
  [string]$PackagePath=(Join-Path $env:USERPROFILE 'Downloads\DachaPar_R80_IA_Model_First_FIX1_20261023.zip'),
  [switch]$Stage
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ExpectedHash='fd215c2d1684828fb7dc90ca4851a39ec7a8516a6c4102dbf460937f4d9730bf'
$Server='deploy@135.106.137.195'
$Remote='/tmp/dachapar-r80-'+[guid]::NewGuid().ToString('N')
if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) { throw "R80_PACKAGE_NOT_FOUND=$PackagePath" }
$PackagePath=(Resolve-Path -LiteralPath $PackagePath).Path
$ActualHash=(Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash.ToLowerInvariant()
if($ActualHash -ne $ExpectedHash){throw "R80_PACKAGE_SHA_MISMATCH_EXPECTED=$ExpectedHash; ACTUAL=$ActualHash"}
foreach($t in @('ssh','scp')) { Get-Command $t -ErrorAction Stop | Out-Null }
# Zip is verified locally first. Server sees only the same bytes by SHA.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive=[IO.Compression.ZipFile]::OpenRead($PackagePath)
try {
  foreach($e in $Archive.Entries){
    if([IO.Path]::IsPathRooted($e.FullName) -or $e.FullName.Contains('\') -or (($e.FullName -split '/') -contains '..')){throw 'R80_UNSAFE_ZIP_PATH'}
  }
  foreach($required in @('install.py','transform.py','SITE_MAP_R80.md')){
    if($null -eq $Archive.GetEntry($required)){throw "R80_MISSING_KIT_FILE=$required"}
  }
}finally {$Archive.Dispose()}
$Opts=@('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
Write-Host "R80_PACKAGE=VERIFIED; SHA256=$ActualHash; MODE=$(if($Stage){'STAGE_ONLY'}else{'READ_ONLY_PREFLIGHT'})"
& ssh @Opts $Server "umask 077 && mkdir -m 700 '$Remote'"
if($LASTEXITCODE -ne 0){throw 'R80_SERVER_TEMP_CREATE_FAILED'}
& scp @Opts $PackagePath ("{0}:{1}/package.zip" -f $Server,$Remote)
if($LASTEXITCODE -ne 0){throw 'R80_UPLOAD_FAILED'}
& ssh @Opts $Server "cd '$Remote' && printf '%s  package.zip\n' '$ExpectedHash' | sha256sum -c - && python3 -m zipfile -e '$Remote/package.zip' '$Remote/kit'"
if($LASTEXITCODE -ne 0){throw 'R80_SERVER_ARCHIVE_VERIFICATION_FAILED'}
$Arg = if($Stage) { '--stage' } else { '' }
Write-Host 'R80_SERVER_PREFLIGHT_OR_NONLIVE_STAGE_BEGIN; USE_EXISTING_SUDO_PASSWORD'
& ssh -tt @Opts $Server "sudo python3 '$Remote/kit/install.py' $Arg"
if($LASTEXITCODE -ne 0){throw 'R80_ABORT_OR_SOURCE_DRIFT; PUBLIC_WEB_UNCHANGED'}
if($Stage){Write-Host 'R80_FIX1_STAGE_CREATED=YES; PUBLIC_SITE_SWITCH=NO; PRODUCTION_WRITES=0'}
else{Write-Host 'R80_PREFLIGHT=PASS; PUBLIC_SITE_SWITCH=NO; PRODUCTION_WRITES=0'}
