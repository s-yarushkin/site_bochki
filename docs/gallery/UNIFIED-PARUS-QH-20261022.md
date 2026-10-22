# Дача Пар — единый релиз «Парус P0 + Квадро Хаус» (22.10.2026)

**Статус: единый RC собран, production НЕ менялся.** Изолированный zip: `DachaPar_Unified_Parus_QH_RC_20261022.zip` SHA-256 **b2ec2c3e3f924e1e36522977661a2bf738d3f5b1523d8e13d5e8f6e7efb735df**. Подготовлен Windows launcher `DACHA_PAR_UNIFIED_DEPLOY.ps1` с default read-only; `-Deploy` отдельно.

## Источники и конфликт двух исходных пакетов

- Исходный архив фото + кода QH взят из Google Диска: https://drive.google.com/drive/folders/1XJ4u8Y2N9iBNvDe38Bp54A0lpfgLR7rS
- За основу взят проверенный SHA `index.html 339391845AA453F6627331755CD52D7C83311B60155B92D7C8B7F4B42060FB77`, общий для QH и Parus RC2. Два независимых установщика **нельзя запускать последовательно**.
- Мерж выполнен от HTML QH пакета с сохранением его `qh-media` и **ровно двух** P0 RC2 cache-busting ссылок `/parus-media/widget.{css,mjs}`, вместе с файлами исправленного виджета.
- Новый набор: **81 файла**, из них 69 WebP (23 кадра × 3 размера), 4 SVG QH, 3 модуля qh-media, изменённые `index.html`, `app.mjs`, `bani/kvadro-haus/index.html`, плюс 2 исправленных Parus JS/CSS.
- `parus-media/content.mjs` **не входит** в изменённые файлы, отдельно защищён SHA `c71b32b2ae4a07db722f5d2cb97d4613aeb68a844efd7d37e395cadcd02276f4`. Все 4 галереи Паруса, 10 опубликованных фото и 5 планировок сохраняются.
- Галерея Квадро Хауса привязана к 5 реальным объектам, оформлена миниатюрами в стиле Паруса; `grid-column:2` предотвращает повтор бага малого фото для группы с 1 кадром.
- Фотографии **не** привязаны к планировкам и ценам; большой обзорный стеклопакет в парной **не приписан** планировке 6×6.

## Тесты в данной среде

- 69/69 WebP: PIL decode PASS, 4/4 SVG: XML parse PASS и проверка отсутствия внешних ссылок/сценариев.
- Node syntax: app.mjs + 2 виджета + content PASS.
- Installer synthetic file system: read-only, activation with unchanged API/protected files, rollback after failed HTTP smoke, source SHA drift-deny, Parus content drift-deny — **5/5 PASS**.
- Изолированный Chromium: **25/25 PASS** на 360, 390, 768, 1366, 1920 px. Проверялся исходный HTML + реальные CSS/виджеты/QH WebP/SVG; отсутствующие модули общего приложения не исполнялись, их функции форм заменены заглушкой. Тесты покрыли 23 кадра × 5 viewport, 4 схемы × 5, маленькое фото Паруса, старт по большому окну, photo-reference. Не путать с full-site browser acceptance.
- Ранее отдельно Parus P0: реальный CSS/WebP bug воспроизведён, Grid fix **40/40 PASS**.

## Решение о публикации

**Не включать production автоматически по локальной приёмке.** Сначала read-only preflight на собственном сервере пользователя, затем полная браузерная приёмка (включая оригинальный app.mjs, callback, передачу `qhRef`, Pricebook/MAX/SQLite/manager/TOTP). При разрешении команды `-Deploy` установщик переключает **только** WEB symlink и проверяет SHA всех 81 публичных файлов, откатывает symlink при неуспешном публичном smoke. GitHub Actions не использовать.
