# Read-only: obtain exact public Parus widget for defect P0 verification.
# No POST, GitHub Actions, SSH, Caddy, SQLite, MAX or manager authentication.
param(
  [string]$Origin = 'https://xn--80aaan1dh9b.xn--p1ai',
  [string]$OutDir = (Join-Path $env:TEMP 'DachaPar-Gallery-V2-P0')
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$paths = @('index.html','parus-media/widget.mjs','parus-media/widget.css','parus-media/content.mjs')
$failed = @()
foreach ($relative in $paths) {
  $name = ($relative -replace '/', '_')
  $target = Join-Path $OutDir $name
  $url = $Origin.TrimEnd('/') + '/' + $relative
  try {
    Invoke-WebRequest -Uri $url -Method Get -OutFile $target -TimeoutSec 30 -UseBasicParsing
    $item = Get-Item -LiteralPath $target
    if ($item.Length -lt 80) { throw "TOO_SMALL_$name" }
    $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    Write-Output "P0_SOURCE=PASS; FILE=$relative; BYTES=$($item.Length); SHA256=$hash; PATH=$target"
  } catch {
    $failed += $relative
    Write-Output "P0_SOURCE=NOT_VERIFIED; FILE=$relative; ERROR=$($_.Exception.Message)"
  }
}
if ($failed.Count -gt 0) { Write-Output "P0_LIVE_SOURCE_SET=INCOMPLETE; MISSING=$($failed -join ',')"; exit 2 }
Write-Output 'P0_LIVE_SOURCE_SET=READY_FOR_REVIEW; PRODUCTION_WRITES=0'
