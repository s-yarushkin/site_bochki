# R73.2 text-only WEB release. Exact Git pin, read-only preflight by default.
# Does not restart API or access SQLite/MAX. No photo or floor-plan changes.
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha,
  [switch]$Deploy
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
foreach($tool in @('git','py','ssh','scp')){Get-Command $tool -ErrorAction Stop | Out-Null}
$Branch='feat/r732-seo-content-no-media-20261021'
$Server='deploy@135.106.137.195'
$Run=Join-Path $env:TEMP ('DachaPar-R732-Text-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Run | Out-Null
$Repo=Join-Path $Run 'repo'
Write-Host 'R732_BEGIN; TEXT_ONLY=YES; PHOTOS=UNCHANGED; FLOORPLANS=UNCHANGED'
& git -c core.autocrlf=false clone --quiet --depth 1 --single-branch --branch $Branch https://github.com/s-yarushkin/site_bochki.git $Repo
if($LASTEXITCODE -ne 0){throw 'GIT_CLONE_FAILED'}
$Actual=(& git -C $Repo rev-parse HEAD).Trim()
if($Actual -ne $SourceSha){throw "SOURCE_PIN_MISMATCH_EXPECTED_$($SourceSha)_GOT_$Actual"}
Write-Host ('RELEASE_SOURCE_SHA='+$SourceSha)
& py -3 -X utf8 (Join-Path $Repo 'tests/test_r732_content.py')
if($LASTEXITCODE -ne 0){throw 'R732_LOCAL_ACCEPTANCE_FAILED'}
$Archive=Join-Path $Run 'source.tar.gz'
& git -C $Repo archive --format=tar.gz "--output=$Archive" $SourceSha premium-r732
if($LASTEXITCODE -ne 0){throw 'SOURCE_ARCHIVE_FAILED'}
$Hash=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
$Remote='/tmp/dachapar-r732-text-'+[guid]::NewGuid().ToString('N')
& ssh -o ConnectTimeout=15 $Server "umask 077 && mkdir -m 700 '$Remote'"
if($LASTEXITCODE -ne 0){throw 'REMOTE_STAGING_FAILED'}
& scp $Archive ("{0}:{1}/source.tar.gz" -f $Server,$Remote)
if($LASTEXITCODE -ne 0){throw 'SOURCE_UPLOAD_FAILED'}
& ssh -o ConnectTimeout=15 $Server "cd '$Remote' && printf '%s  source.tar.gz\n' '$Hash' | sha256sum -c - && mkdir -m 700 source && tar -xzf source.tar.gz -C source"
if($LASTEXITCODE -ne 0){throw 'REMOTE_ARCHIVE_CHECK_FAILED'}
$Installer="$Remote/source/premium-r732/install.py"
Write-Host 'R732_SERVER_PREFLIGHT_BEGIN; READ_ONLY=YES; ENTER_EXISTING_SUDO_PASSWORD'
& ssh -tt -o ConnectTimeout=15 $Server "sudo python3 '$Installer' --source-sha '$SourceSha'"
if($LASTEXITCODE -ne 0){throw 'R732_PREFLIGHT_FAILED_NO_DEPLOY'}
if(-not $Deploy){
  Write-Host 'R732_PREFLIGHT_ONLY=PASS; PUBLIC_RELEASE=0'
  Write-Host 'Use the same SourceSha with -Deploy to install the reviewed release.'
  Write-Host ('LOCAL_EVIDENCE='+$Run)
  return
}
Write-Host 'R732_ACTIVATE_BEGIN; WEB_ONLY=YES'
& ssh -tt -o ConnectTimeout=15 $Server "sudo python3 '$Installer' --source-sha '$SourceSha' --activate"
if($LASTEXITCODE -ne 0){throw 'R732_INSTALL_FAILED_CHECK_ROLLBACK_LOG_DO_NOT_BLIND_RETRY'}
Write-Host 'DACHA_PAR_R732_TEXT_RELEASE=PASS; API=UNCHANGED; SQLITE=UNTOUCHED; MAX_CALLS=0; PHOTOS=UNCHANGED; FLOORPLANS=UNCHANGED'
Write-Host ('LOCAL_EVIDENCE='+$Run)
