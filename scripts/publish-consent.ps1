param([switch]$Prepared)
$Host.UI.RawUI.WindowTitle = 'Дача Пар — компактный баннер'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONIOENCODING = 'utf-8'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$publishScript = Join-Path $PSScriptRoot 'publish-consent-terminal.py'
if ($Prepared) {
  & 'C:\Users\Natalya\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -u $publishScript --prepared
} else {
  & 'C:\Users\Natalya\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -u $publishScript
}
