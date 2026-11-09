$Host.UI.RawUI.WindowTitle = 'Дача Пар — компактный баннер'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONIOENCODING = 'utf-8'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& 'C:\Users\Natalya\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -u (Join-Path $PSScriptRoot 'publish-consent-terminal.py')
