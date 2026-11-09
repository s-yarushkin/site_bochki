param([switch]$Prepared,[switch]$Uploaded)
$Host.UI.RawUI.WindowTitle = 'Дача Пар — финальная публикация'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONIOENCODING = 'utf-8'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$publishScript = Join-Path $PSScriptRoot 'publish-consent-terminal.py'
$publishArgs = @('-u', $publishScript)
if ($Prepared) { $publishArgs += '--prepared' }
if ($Uploaded) { $publishArgs += '--uploaded' }
& 'C:\Users\Natalya\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' @publishArgs
