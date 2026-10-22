Дача Пар — единый релиз: браузерная приёмка V2 (22.10.2026)

ИСПРАВЛЕН ТОЛЬКО ТЕСТ. Релизный ZIP из 81 файла НЕ изменён.

Причина предыдущих 3 ошибок CDP_TIMEOUT: тест ожидал img.decode() сразу после
программного нажатия на 4 варианта планировок, но SVG img имеет loading="lazy"
и расположен ниже первого экрана. В изолированном Chromium воспроизведена
отложенная загрузка offscreen lazy SVG, а после прокрутки — успешное чтение
всех 4 реальных SVG 4/4.

V2:
- прокручивает к планировке как посетитель сайта;
- проверяет 4 SVG отдельно, с явным id/url и ограничением ожидания 6.5 с;
- НЕ засчитывает timeout или ошибку загрузки как PASS;
- проверяет те же два виджета, fix 44px, pricebook, форму и отсутствие POST;
- проверяет SHA релизного ZIP b2ec2c3e... и самого теста, Node 22+;
- работает полностью READ_ONLY, не делает SSH и не вызывает -Deploy.

Инструкция:
1. Старый релизный архив DachaPar_Unified_Parus_QH_RC_20261022.zip
   оставить в Downloads (он уже прошёл серверную проверку).
2. Распаковать этот новый toolkit ZIP в Downloads\DachaPar-Unified-Acceptance-V2.
3. Запустить из PowerShell без префикса PS C:\...>:
   powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\DachaPar-Unified-Acceptance-V2\DachaPar_Unified_Browser_Acceptance_V2.ps1"
4. Пришлите вывод начиная с UNIFIED_V2_TEST_SHA256 и до UNIFIED_V2_BROWSER_ACCEPTANCE.

Границы проверки: любые POST блокируются. Фактическую доставку заявки в MAX,
сохранение в SQLite и доступ в кабинет менеджера этот тест не проверяет.
Не считать завершение этого теста автоматическим разрешением на production deploy.
