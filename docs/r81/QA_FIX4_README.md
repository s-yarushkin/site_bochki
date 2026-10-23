# Дача Пар R8.1 — QA FIX4 (23 октября 2026)

Исправлен только проверочный манифест: у app.mjs SHA-256 релизного ZIP FIX2 023dc529e54ee17073f6a531f22a0a2e4bf6b4ecd1a5c99964157e48a3cfc47f. Прежний QA FIX2/FIX3 ссылался на устаревший app.mjs и выдавал STAGE_SHA_DRIFT_app.mjs до запуска браузера.

Релиз для приёмки: /srv/sites/dachapar-preview/releases/CJM-R81-20261023-1792748144511530110

FIX4 не меняет код сайта, установщик, исходный релиз или JS-тест. Исправлены только manifest.json, его pin в оболочке PowerShell и эта инструкция. Browser test SHA256: 845c483eaf3183552242d788d5ba25d82681bccbafee154bff63ec7a341db4bd; FIX4 manifest SHA256: 4d2646abba5ebb8aabefb88d713f196fb7d51691c6ab176f8b3dbc77f0ea8858.

Сохраните ZIP в Downloads и в PowerShell:

```powershell
$downloads = "$env:USERPROFILE\Downloads"
$qa = Join-Path $downloads "DachaPar_R81_42QA_FIX4"
Expand-Archive -LiteralPath (Join-Path $downloads "DachaPar_R81_Browser_42QA_FIX4_20261023.zip") -DestinationPath $qa -Force
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $qa "DachaPar_R81_Browser_42QA_FIX4_20261023.ps1") -Stage "/srv/sites/dachapar-preview/releases/CJM-R81-20261023-1792748144511530110"
```

Ожидается прохождение контрольных сумм и запуск QA01–QA42. QA08 остаётся NOT_TESTED до подтверждения статистики «80%»: итог NO_GO возможен и не означает повреждение релиза.

Не запускать старый пакет тестов FIX2/FIX3. Никаких POST на публичный API, только локальные имитаторы на 127.0.0.1. Не публикует stage.
