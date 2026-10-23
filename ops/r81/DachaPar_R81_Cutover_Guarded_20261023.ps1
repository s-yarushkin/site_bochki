# Dacha Par R8.1 FIX2 production cutover wrapper. DEFAULT = PREFLIGHT ONLY.
# NO GitHub Actions / Remote Desktop Commander. WEB-only release, no lead POST.
# Modes: default preflight; -Deploy -ManagerReady -Approval <exact token>; -Rollback; -Status.
[CmdletBinding()]
param(
    [switch]$Deploy,
    [switch]$Rollback,
    [switch]$Status,
    [switch]$ManagerReady,
    [string]$Approval = '',
    [string]$PackagePath = '',
    [string]$QaEvidencePath = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ModeCount = 0
if ($Deploy) { $ModeCount++ }
if ($Rollback) { $ModeCount++ }
if ($Status) { $ModeCount++ }
if ($ModeCount -gt 1) { throw 'R81_MODES_ARE_MUTUALLY_EXCLUSIVE' }
$Server = 'deploy@135.106.137.195'
$SshOptions = @('-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes')
$Stage = '/srv/sites/dachapar-preview/releases/CJM-R81-20261023-1792748144511530110'
$Old = '/srv/sites/dachapar-preview/releases/CJM-R80-20261022-1792731611547801280'
$ExpectedPackageSha = '79dd0e498eabba65ad0effad0d888f04b851171871f5fa5cf22b46ba155ef31c'
$ExpectedGuardSha = '367c8a049759b235a4067d7b0854bd5061d059ff47f0f5e6c9b1a1709aa6aa6d'
$ApprovalToken = 'PUBLISH_R81_FIX2_WITHOUT_80_20261023'
$ExpectedEvidenceFile = 'DachaPar_R81_Stage_42QA_Result_1792753988494.json'
$ScriptFile = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ScriptFile)) { throw 'R81_CUTOVER_WRAPPER_PATH_UNAVAILABLE' }
$ScriptDirectory = [IO.Path]::GetDirectoryName($ScriptFile)
$GuardLocal = Join-Path $ScriptDirectory 'r81_release_guard.py'
if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $PackagePath = Join-Path $env:USERPROFILE 'Downloads\DachaPar_R81_CJM_FIX2_20261023.zip'
}
if ([string]::IsNullOrWhiteSpace($QaEvidencePath)) {
    $QaEvidencePath = Join-Path $env:TEMP $ExpectedEvidenceFile
}
foreach ($tool in @('ssh', 'scp')) { Get-Command $tool -ErrorAction Stop | Out-Null }
if (-not (Test-Path -LiteralPath $GuardLocal -PathType Leaf)) { throw 'R81_GUARD_PY_MISSING' }
$guardHash = (Get-FileHash -LiteralPath $GuardLocal -Algorithm SHA256).Hash.ToLowerInvariant()
if ($guardHash -ne $ExpectedGuardSha) { throw "R81_GUARD_HASH_MISMATCH=$guardHash" }
if ($Deploy) {
    if ($Approval -cne $ApprovalToken) { throw 'R81_DEPLOY_REQUIRES_EXPLICIT_APPROVAL_TOKEN' }
    if (-not $ManagerReady) { throw 'R81_DEPLOY_REQUIRES_MANAGER_WORKFLOW_CONFIRMED' }
} elseif (-not [string]::IsNullOrWhiteSpace($Approval)) {
    throw 'R81_APPROVAL_TOKEN_ACCEPTED_ONLY_FOR_DEPLOY'
}

function Confirm-QAEvidence {
    if (-not (Test-Path -LiteralPath $QaEvidencePath -PathType Leaf)) {
        throw "R81_QA_EVIDENCE_NOT_FOUND=$QaEvidencePath"
    }
    $r = Get-Content -LiteralPath $QaEvidencePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($r.stage -cne [IO.Path]::GetFileName($Stage)) { throw "R81_QA_STAGE_MISMATCH=$($r.stage)" }
    $cases = @($r.cases.PSObject.Properties)
    if ($cases.Count -ne 42) { throw "R81_QA_CASES_EXPECTED_42_ACTUAL=$($cases.Count)" }
    foreach ($number in 1..42) {
        $name = 'QA{0:D2}' -f $number
        $case = $r.cases.PSObject.Properties[$name]
        if ($null -eq $case) { throw "R81_QA_CASE_MISSING=$name" }
        if ($name -eq 'QA08') {
            if ($case.Value.status -cne 'NOT_TESTED') { throw 'R81_QA08_MUST_BE_DOCUMENTED_EXCEPTION' }
        } elseif ($case.Value.status -cne 'PASS') {
            throw "R81_QA_CASE_NOT_ACCEPTED=$name; STATUS=$($case.Value.status)"
        }
    }
    if ([int]$r.status.PASS -ne 41 -or [int]$r.status.FAIL -ne 0 -or [int]$r.status.NOT_TESTED -ne 1) {
        throw 'R81_QA_REPORT_SUMMARY_MISMATCH'
    }
    if ([int]$r.productionWrites -ne 0) { throw 'R81_QA_REPORT_PRODUCTION_WRITES_NONZERO' }
    Write-Host "R81_QA_EVIDENCE=PASS; PASSED=41; FAILED=0; WAIVED_QA08=YES; STAGE=$($r.stage)"
}

$RemoteDir = '/tmp/dachapar-r81-cutover-' + [guid]::NewGuid().ToString('N')
$MadeRemoteDir = $false
function Invoke-SSHChecked([string]$Command, [string]$ErrorLabel, [bool]$Tty = $false) {
    if ($Tty) { & ssh -tt @SshOptions $Server $Command }
    else { & ssh @SshOptions $Server $Command }
    if ($LASTEXITCODE -ne 0) { throw $ErrorLabel }
}
function Invoke-Guard([string]$Mode, [bool]$UseKit) {
    $command = "sudo python3 '$RemoteDir/r81_release_guard.py' --mode $Mode"
    if ($UseKit) { $command += " --kit-dir '$RemoteDir/kit'" }
    Invoke-SSHChecked $command "R81_RELEASE_GUARD_${Mode}_FAILED" $true
}
try {
    Write-Host "R81_MODE=$(if ($Rollback) {'ROLLBACK'} elseif ($Deploy) {'DEPLOY'} elseif ($Status) {'STATUS'} else {'PREFLIGHT'})"
    Write-Host "R81_EXPECTED_OLD=$Old"
    Write-Host "R81_EXACT_NEW=$Stage"
    Write-Host 'R81_QA08_EXCEPTION=APPROVED; UNVERIFIED_80_COPY=NOT_PUBLISHED'
    if (-not ($Rollback -or $Status)) {
        Confirm-QAEvidence
        if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
            throw "R81_RELEASE_ZIP_MISSING=$PackagePath"
        }
        $pHash = (Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($pHash -ne $ExpectedPackageSha) { throw "R81_RELEASE_ZIP_HASH_MISMATCH=$pHash" }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $PackagePath).Path)
        try {
            foreach ($entry in $archive.Entries) {
                if ([IO.Path]::IsPathRooted($entry.FullName) -or $entry.FullName.Contains('\') -or
                  (($entry.FullName -split '/') -contains '..')) { throw 'R81_ZIP_UNSAFE_PATH' }
            }
            foreach ($needed in @('installer.py', 'manifest.json', 'overlay/app.mjs', 'overlay/index.html')) {
                if ($null -eq $archive.GetEntry($needed)) { throw "R81_ZIP_MISSING=$needed" }
            }
        } finally { $archive.Dispose() }
        Write-Host "R81_PACKAGE=VERIFIED; SHA256=$pHash"
    }
    Invoke-SSHChecked "umask 077 && mkdir -m 700 '$RemoteDir'" 'R81_REMOTE_DIRECTORY_FAILURE'
    $MadeRemoteDir = $true
    & scp @SshOptions $GuardLocal ("{0}:{1}/r81_release_guard.py" -f $Server, $RemoteDir)
    if ($LASTEXITCODE -ne 0) { throw 'R81_REMOTE_GUARD_UPLOAD_FAILED' }
    Invoke-SSHChecked "printf '%s  %s\n' '$ExpectedGuardSha' 'r81_release_guard.py' | (cd '$RemoteDir' && sha256sum -c -)" 'R81_REMOTE_GUARD_VERIFY_FAILED'

    if ($Rollback) {
        Invoke-Guard 'rollback' $false
        Write-Host 'R81_WINDOWS_ROLLBACK=PASS; WEB=R80; API_NOT_CHANGED_BY_SCRIPT=YES'
    } elseif ($Status) {
        Invoke-Guard 'status' $false
        Write-Host 'R81_WINDOWS_STATUS=PASS; READ_ONLY=YES'
    } else {
        & scp @SshOptions $PackagePath ("{0}:{1}/package.zip" -f $Server, $RemoteDir)
        if ($LASTEXITCODE -ne 0) { throw 'R81_REMOTE_PACKAGE_UPLOAD_FAILED' }
        Invoke-SSHChecked "cd '$RemoteDir' && printf '%s  package.zip\n' '$ExpectedPackageSha' | sha256sum -c - && mkdir kit && python3 -m zipfile -e package.zip kit" 'R81_REMOTE_PACKAGE_VERIFY_FAILED'
        # Independent stage audit + exact 64-SHA check. Does not switch current.
        Invoke-Guard 'preflight' $true
        Invoke-SSHChecked "sudo python3 '$RemoteDir/kit/installer.py'" 'R81_INSTALLER_PREFLIGHT_FAILED' $true
        Write-Host 'R81_CUTOVER_PREFLIGHT=PASS; EXACT_STAGE=YES; MANIFEST=PASS; PRODUCTION_SWITCH=NO'
        if ($Deploy) {
            Write-Host 'R81_ACTIVATE_BEGIN; WEB_ONLY=YES; AUTO_ROLLBACK_ON_PUBLIC_HASH_FAILURE=YES'
            & ssh -tt @SshOptions $Server "sudo python3 '$RemoteDir/kit/installer.py' --activate '$Stage'"
            if ($LASTEXITCODE -ne 0) {
                Write-Warning 'R81_INSTALLER_ACTIVATION_FAILED; ATTEMPTING_GUARDED_ROLLBACK'
                Invoke-Guard 'rollback' $false
                throw 'R81_ACTIVATE_FAILED; WEB_ROLLBACK_COMPLETED_OR_R80_ALREADY_ACTIVE'
            }
            Write-Host 'R81_INSTALLER_ACTIVATION=PASS; CHECKING_PUBLIC_HASHES_AND_POINTERS'
            & ssh -tt @SshOptions $Server "sudo python3 '$RemoteDir/r81_release_guard.py' --mode post --kit-dir '$RemoteDir/kit'"
            if ($LASTEXITCODE -ne 0) {
                Write-Warning 'R81_POSTCHECK_FAILED; ROLLING_BACK_TO_R80'
                Invoke-Guard 'rollback' $false
                throw 'R81_POSTCHECK_FAILED; WEB_ROLLED_BACK_TO_R80'
            }
            Write-Host 'R81_WINDOWS_CUTOVER=PASS; WEB=R81_FIX2; API_UNCHANGED=YES; SQLITE_UNTOUCHED=YES; MAX_POSTS=0'
        } else {
            Write-Host 'R81_WINDOWS_PREFLIGHT=PASS; WEB_STILL_R80=YES; PRODUCTION_WRITES=0'
        }
    }
} finally {
    if ($MadeRemoteDir) {
        # Random GUID path created by this session only. Cleanup is best-effort.
        & ssh @SshOptions $Server "rm -rf '$RemoteDir'" 2>$null | Out-Null
    }
}
