Дача Пар R8.0 — Browser acceptance for exact staged release

Активный stage из подтверждённого лога:
/srv/sites/dachapar-preview/releases/CJM-R80-20261022-1792731611547801280

Режим: READ_ONLY. PowerShell получает 9 файлов из НЕАКТИВНОЙ копии через SSH/SCP, проверяет, что live WEB по-прежнему GALLERY-UNIFIED-20261022-parus-qh-v1. Распаковывает локально и запускает Chrome/Edge с настоящим app.mjs и прочими публичными файлами из текущего сайта через GET-only proxy. Любые POST/внешние браузерные запросы блокируются. Реальные заявки не создаются. Приватные API/кабинет не запрашиваются.

Для запуска (ZIP и PS в Downloads):
$downloads = "$env:USERPROFILE\Downloads"
$folder = Join-Path $downloads "DachaPar_R80_Stage_QA"
Expand-Archive -LiteralPath (Join-Path $downloads "DachaPar_R80_Stage_Browser_Acceptance_20261023.zip") -DestinationPath $folder -Force
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $folder "DachaPar_R80_Stage_Browser_Acceptance.ps1")

Успех: R80_STAGE_BROWSER_ACCEPTANCE=PASS; FAILED=0 и R80_WINDOWS_STAGE_ACCEPTANCE=PASS
Ошибки: R80_BROWSER_FAIL=... и R80_STAGE_BROWSER_ACCEPTANCE=NO_GO.

Не включать --activate/-Deploy на основании только этого теста: нужна финальная визуальная приемка и проверка релизных метрик/SEO. GitHub Actions не используются.
