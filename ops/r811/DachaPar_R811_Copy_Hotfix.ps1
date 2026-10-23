# R8.1.1 protected one-file WEB-only copy hotfix. One remote sudo call per invocation.
# Default: read-only preflight. -Deploy requires explicit approval. -Rollback returns to R8.1 FIX2.
[CmdletBinding()]
param(
    [switch]$Deploy,
    [switch]$Rollback,
    [switch]$Status,
    [string]$Approval = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ModeCount = 0
if ($Deploy) { $ModeCount++ }; if ($Rollback) { $ModeCount++ }; if ($Status) { $ModeCount++ }
if ($ModeCount -gt 1) { throw 'R811_MUTUALLY_EXCLUSIVE_MODES' }
$Mode = 'preflight'
if ($Deploy) { $Mode = 'deploy' }
if ($Rollback) { $Mode = 'rollback' }
if ($Status) { $Mode = 'status' }
if ($Deploy -and $Approval -cne 'R811_HERO_COPY_APPROVED') { throw 'R811_EXPLICIT_APPROVAL_REQUIRED' }
if (-not $Deploy -and $Approval -ne '') { throw 'R811_APPROVAL_ONLY_FOR_DEPLOY' }
$Self = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($Self)) { throw 'R811_SCRIPT_PATH_UNAVAILABLE' }
$Dir = [IO.Path]::GetDirectoryName($Self)
$Payload = Join-Path $Dir 'r811_payload.zip'
if (-not (Test-Path -LiteralPath $Payload -PathType Leaf)) { throw 'R811_PAYLOAD_NOT_FOUND' }
$ExpectedHash = 'ddb95c2e0d57b5473582c069c1e1db2bd9a2341edeb03123ae4e14dd2d7f792a'
$ActualHash = (Get-FileHash -LiteralPath $Payload -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualHash -cne $ExpectedHash) { throw ('R811_PAYLOAD_SHA_MISMATCH=' + $ActualHash) }
foreach ($name in @('ssh','scp')) { Get-Command $name -ErrorAction Stop | Out-Null }
$Server = 'deploy@135.106.137.195'
$SshOptions = @('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
$RemoteDir = '/tmp/dachapar-r811-hero-' + [guid]::NewGuid().ToString('N')
$Created = $false
try {
    Write-Host ('R811_MODE=' + $Mode + '; WEB_ONLY=YES; CHANGED_FILES=1; MAX_POSTS=0')
    & ssh @SshOptions $Server "umask 077 && mkdir -m 700 '$RemoteDir'"
    if ($LASTEXITCODE -ne 0) { throw 'R811_REMOTE_TMP_CREATE_FAILED' }
    $Created = $true
    & scp @SshOptions $Payload ("{0}:{1}/r811_payload.zip" -f $Server,$RemoteDir)
    if ($LASTEXITCODE -ne 0) { throw 'R811_SCP_FAILED' }
    $Verify = "cd '$RemoteDir' && echo '$ExpectedHash  r811_payload.zip' | sha256sum -c - && python3 -m zipfile -e r811_payload.zip . && python3 -m py_compile hotfix.py"
    & ssh @SshOptions $Server $Verify
    if ($LASTEXITCODE -ne 0) { throw 'R811_REMOTE_PAYLOAD_VERIFY_FAILED' }
    # Exactly ONE sudo invocation per action (no repeated preflight SSH+sudo loops).
    & ssh -tt @SshOptions $Server "sudo python3 '$RemoteDir/hotfix.py' --mode $Mode"
    if ($LASTEXITCODE -ne 0) {
        if ($Deploy) { Write-Warning 'R811_DEPLOY_UNCLEAR_OR_FAILED; DO_NOT_RETRY_DEPLOY; CHECK -Status FIRST' }
        throw ('R811_' + $Mode.ToUpperInvariant() + '_FAILED')
    }
    if ($Deploy) { Write-Host 'R811_WINDOWS_DEPLOY=PASS; ONE_SUDO_INVOCATION=YES; WEB_ONLY=YES' }
    elseif ($Rollback) { Write-Host 'R811_WINDOWS_ROLLBACK=PASS; ONE_SUDO_INVOCATION=YES' }
    else { Write-Host ('R811_WINDOWS_' + $Mode.ToUpperInvariant() + '=PASS; ONE_SUDO_INVOCATION=YES') }
} finally {
    if ($Created) {
        & ssh @SshOptions $Server "rm -rf '$RemoteDir'" 2>$null | Out-Null
    }
}
