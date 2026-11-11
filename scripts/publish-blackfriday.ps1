param([string]$Package='blackfriday-20261110')
if ($Package -notmatch '^blackfriday[-a-z0-9]+$') { throw 'Invalid package directory' }
$env:DACHAPAR_BF_PACKAGE = $Package
$Host.UI.RawUI.WindowTitle = 'ДачаПар — Черная пятница'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONIOENCODING = 'utf-8'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& 'C:\Users\Natalya\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -u (Join-Path $PSScriptRoot 'publish-blackfriday-terminal.py')
