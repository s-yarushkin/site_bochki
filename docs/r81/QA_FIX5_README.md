# Dacha Par R8.1 QA FIX5 — Windows SSH/Bash CRLF repair

Preflight failure addressed: `: invalid option namepefail` from `set -euo pipefail\r`.
PowerShell 5.1 CRLF here-string was base64 encoded unchanged in FIX4. FIX5 explicitly normalizes CRLF to LF before encoding, validates no carriage returns remain.

The exact 42 QA JavaScript test and 64-file stage manifest are byte-for-byte unchanged from FIX4. No server stage or app changes.

Staged release: `/srv/sites/dachapar-preview/releases/CJM-R81-20261023-1792748144511530110`.
Public live R8.0 remains unchanged. Tester uses GET-only public proxy, stage-only archive download and synthetic local 127.0.0.1 lead response; no production POST, no deploy.

PowerShell command:
```powershell
$qa = Join-Path $env:USERPROFILE 'Downloads\DachaPar_R81_42QA_FIX5'
Expand-Archive -LiteralPath (Join-Path $env:USERPROFILE 'Downloads\DachaPar_R81_Browser_42QA_FIX5_20261023.zip') -DestinationPath $qa -Force
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $qa 'DachaPar_R81_Browser_42QA_FIX5_20261023.ps1') -Stage '/srv/sites/dachapar-preview/releases/CJM-R81-20261023-1792748144511530110'
```

Local reproducible validation performed: old CRLF remote Bash failure reproduced, new LF-encoded remote Bash successful, tar packaged exactly 64 real FIX2 overlay files, SHA256 of all files matched FIX2 manifest, Node --check PASS.
The actual user's Windows Chromium 42QA acceptance still pending. QA08 numeric 80% statistic intentionally not substantiated; NOT_TESTED/NO_GO is an expected business gate and should not be overridden.
