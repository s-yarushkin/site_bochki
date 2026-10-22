# Archive exact public gallery files previously downloaded with live-probe.ps1
# Read-only, no remote writes, no credentials. Requires files with known SHA256.
param([string]$InputDir = (Join-Path $env:TEMP 'DachaPar-Gallery-V2-P0'),
      [string]$OutFile = (Join-Path $env:USERPROFILE 'Downloads\DachaPar-P0-live-source-20261022.zip'))
$ErrorActionPreference = 'Stop'
$checks = @(
  @{Name='index.html'; Sha='339391845AA453F6627331755CD52D7C83311B60155B92D7C8B7F4B42060FB77'},
  @{Name='parus-media_widget.mjs'; Sha='F0F02302B01C4072194381D0755CF35DAA8BE529BA91A2EEC27DF9162E79872A'},
  @{Name='parus-media_widget.css'; Sha='BA6CC1CE1D41F4A545A77A68853F39505F8A9B3E44BD5944712B0D10385E2E72'},
  @{Name='parus-media_content.mjs'; Sha='C71B32B2AE4A07DB722F5D2CB97D4613AEB68A844EFD7D37E395CADCD02276F4'}
)
$paths = @()
foreach ($c in $checks) {
  $path = Join-Path $InputDir $c.Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "MISSING_FILE: $($c.Name)" }
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  if ($actual -ne $c.Sha) { throw "HASH_MISMATCH: $($c.Name) actual=$actual" }
  $paths += $path
  Write-Output "SOURCE_HASH_PASS=$($c.Name)"
}
New-Item -ItemType Directory -Path (Split-Path $OutFile -Parent) -Force | Out-Null
Compress-Archive -LiteralPath $paths -DestinationPath $OutFile -Force
Write-Output "P0_SOURCE_PACKAGE_READY=$OutFile"
Write-Output 'PRODUCTION_WRITES=0; PRIVATE_FILES=0; ONLY_PUBLIC_WEB_ASSETS=YES'
