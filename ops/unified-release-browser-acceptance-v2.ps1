# Unified Dacha Par RC: browser acceptance v2 (lazy SVG regression).
# READ ONLY. Cannot deploy; does not send leads, API POST, or modify production.
param(
  [string]$PackagePath = (Join-Path $env:USERPROFILE 'Downloads\DachaPar_Unified_Parus_QH_RC_20261022.zip'),
  [string]$TestPath = (Join-Path $PSScriptRoot 'DachaPar_Unified_Browser_Acceptance_V2.mjs')
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ExpectedPackage = 'b2ec2c3e3f924e1e36522977661a2bf738d3f5b1523d8e13d5e8f6e7efb735df'
$ExpectedTest = 'd860585ae4bc608109ef6feeb38a166032650abdf902a902448d040889b58bb7'
if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) { throw "PACKAGE_NOT_FOUND: $PackagePath" }
if (-not (Test-Path -LiteralPath $TestPath -PathType Leaf)) { throw "BROWSER_TEST_MISSING: $TestPath" }
$actualPackage = (Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash.ToLowerInvariant()
$actualTest = (Get-FileHash -LiteralPath $TestPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualPackage -ne $ExpectedPackage) { throw "WRONG_RELEASE_PACKAGE expected=$ExpectedPackage actual=$actualPackage" }
if ($actualTest -ne $ExpectedTest) { throw "WRONG_TEST_SCRIPT expected=$ExpectedTest actual=$actualTest" }
Get-Command node -ErrorAction Stop | Out-Null
$major = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($major -lt 22) { throw "NODE_22_REQUIRED_CURRENT=$major" }
& node --check $TestPath
if ($LASTEXITCODE -ne 0) { throw 'TEST_SYNTAX_CHECK_FAILED' }
$run = Join-Path $env:TEMP ('DachaPar-Unified-BrowserAcceptance-V2-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
try {
  Expand-Archive -LiteralPath $PackagePath -DestinationPath $run -Force
  $payload = Join-Path $run 'payload'
  foreach ($name in @('index.html', 'app.mjs', 'qh-media\widget.mjs', 'parus-media\widget.mjs', 'qh-media\assets\plans\kh-6x6-bedroom.svg')) {
    if (-not (Test-Path -LiteralPath (Join-Path $payload $name) -PathType Leaf)) { throw "RELEASE_FILE_MISSING: $name" }
  }
  Write-Output 'UNIFIED_V2_TEST_SHA256=PASS; RELEASE_PACKAGE_SHA256=PASS; MODE=READ_ONLY; PRODUCTION_WRITES=0'
  & node $TestPath $payload
  $testExit = $LASTEXITCODE
  Write-Output "UNIFIED_V2_BROWSER_EXIT=$testExit; PRODUCTION_WRITES=0"
  if ($testExit -ne 0) { throw 'UNIFIED_V2_BROWSER_ACCEPTANCE_NO_GO' }
  Write-Output 'UNIFIED_V2_BROWSER_ACCEPTANCE=PASS; PRODUCTION_WRITES=0'
} finally {
  Remove-Item -LiteralPath $run -Recurse -Force -ErrorAction SilentlyContinue
}
