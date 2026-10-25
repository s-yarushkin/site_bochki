# Изолированный preview «Гарант Бани» на домене «Дизайн-Завод»

**Статус: STAGED-PLAN ONLY. На сервере ничего не опубликовано.**  
Дата: 08.10.2026  
Исходный код: репозиторий \`s-yarushkin/site_bochki\`, PR #6, ветка \`feat/garant-bani-dacha-emotion-prototype\`.  
Предлагаемый адрес: \`https://дизайн-завод.рф/bani-preview/\` (punycode \`https://xn----7sbbigeqcfm8bq.xn--p1ai/bani-preview/\`).  
Действующий коммерческий сайт «Дизайн-Завод» и его MAX relay должны остаться **без изменений**.

## Почему не делать обычный deploy «Диззавода»

Проверено по \`s-yarushkin/design-zavod\`:
- Caddy site block раздаёт root \`/srv/sites/design-zavod/current\`, а запросы \`POST /api/lead\` проксирует на \`127.0.0.1:3100\`.
- Deploy-скрипт сайта выпускает неизменяемую пару static + relay, перезапускает действующий рабочий обработчик заявок и меняет symlink \`current\`. Он **не** предназначен для размещения экспериментального сайта.
- Поэтому не добавлять \`bani-preview\` прямо в текущую sealed release «Диззавода», не менять \`main\` другого репозитория, не копировать MAX credentials.

## Целевая структура

\`\`\`text
Host Caddy :443 (same domain)
  /api/lead       -> existing design-zavod relay, untouched
  /bani-preview/  -> /srv/sites/garant-bani-preview/current/ (STATIC ONLY, Basic Auth)
  everything else -> /srv/sites/design-zavod/current/ (existing design-zavod static)
\`\`\`

Каталог статического preview **отдельный**, собственный \`current\` symlink, собственная атомарная публикация zip/директории, **без systemd, Node.js API, БД, MAX, GitHub Actions, других сервисов**. Браузер исполняет только статические JS-модули конструктора. Формы — демо, персональные данные не отправляются.

## Что изменить один раз после owner GO

Управляемое изменение только Caddy сайта \`xn----7sbbigeqcfm8bq.xn--p1ai\`: добавить отдельный route перед общим catch-all \`handle { file_server }\`. **Не** заменять полностью Caddyfile; учитывать другие активные host blocks, читать актуальный файл на сервере.

Пример фрагмента, **не готов для прямого копирования до подстановки bcrypt-хеша и fresh preflight**:

\`\`\`caddyfile
    @baniPreviewBase {
        path /bani-preview
    }
    handle @baniPreviewBase {
        redir /bani-preview/ 308
    }
    handle_path /bani-preview/* {
        root * /srv/sites/garant-bani-preview/current
        header X-Robots-Tag "noindex, nofollow, noarchive"
        header Cache-Control "no-store"
        basic_auth bcrypt {
            preview <BCRYPT_HASH_PRODUCED_PRIVATELY_ON_SERVER>
        }
        file_server
    }
\`\`\`

Замену хеша делать на сервере, **не** вводить настоящий пароль в GitHub/чат/PowerShell history. Проверить версию Caddy и поддерживаемый синтаксис \`basic_auth\`; в старых версиях имя директивы \`basicauth\`. Использовать только валидный конфиг для фактической версии.

**Изоляция:** маршрут \`/api/lead\` сохраняет поведение Design Zavod, но оба пути принадлежат одному origin. Это значит, что /bani-preview/ является функциональной изоляцией статического контента, а **не** строгой security origin isolation. В preview-зоне не должно быть сторонних скриптов, перенаправлений формы на \`/api/lead\` или service workers на корневом scope. При необходимости жёсткой изоляции использовать отдельный поддомен.

## Подготовка артефакта

Пакет \`garant-bani-preview-static.zip\` формируется из точного review SHA репозитория \`site_bochki\` только из шести файлов:

\`\`\`text
index.html
assets/css/site.css
assets/js/app.js
assets/js/quote-engine.js
assets/images/placeholder.svg
data/pricebook.js
\`\`\`

Никаких исходных дилерских прайсов, \`.env\`, test-fixtures с ПДн, ключей, relay code или чужих сайтов.

В \`index.html\`: \`meta robots=noindex,nofollow\`, видимая полоса «ДЕМО · цены/скидки условные · заявки не отправляются». CSS/JS ссылки **относительные**; \`handle_path\` удаляет prefix и файл раздаётся корректно из \`current\`.

## Рекомендуемый порядок работ

**Операции без production-изменений:**
1. Сверить exact source SHA, отсутствие незакоммиченных изменений, состав ZIP, хеш и unit/smoke tests.
2. Проверить статический сервер локально с префиксом \`/bani-preview/\`; убедиться в отсутствии абсолютных root-relative URL и сетевых POST из формы.
3. Сверить HEAD текущих репозиториев, server runbook и условия выпуска.

**Только с отдельным owner GO и доступом sudo:**
4. Fresh read-only preflight сервера: hostname, Caddy status/config syntax, current/previous links Design Zavod, root free, здоровье Design Zavod MAX relay, здоровье Horizon 12. При любом red flag — STOP.
5. Сделать root-only бэкап точного действующего Caddyfile + фиксировать checksum и возможный rollback.
6. Создать отдельный root-owned каталог \`/srv/sites/garant-bani-preview/releases/<releaseId>\`; убедиться, что в архиве нет \`../\`, symlink, device, hard link или absolute path; распаковать только allowlisted files; проверить хеши и readonly mode.
7. Выставить отдельный \`/srv/sites/garant-bani-preview/current\` только после полного staging. Релизы immutable; не писать в действующий current.
8. Локально проверить **полный Caddyfile**: \`caddy validate --config /etc/caddy/Caddyfile\`; не делать reload при ошибках.
9. После owner GO на сетевой switch — atomically replace reviewed Caddyfile и reload только Caddy. Не перезапускать MAX relay, Horizon 12 или систему.
10. Smoke: \`/bani-preview\` → 308; \`/bani-preview/\` без авторизации → 401; с auth → 200; CSS, JS, JSON modules загружаются; X-Robots-Tag=noindex; доменная главная «Диззавода» идентична до/после; \`GET /api/lead\` по-прежнему 405; здоровье /health relay только локально read-only; Horizon 12 healthy.
11. В браузере: собрать баню, изменить допы, убедиться в \`927000 → 857000\`, обе формы дают именно «заявка НЕ отправлена». DevTools network не содержит \`POST /api/lead\`.
12. Записать live URL, exact package checksum, дату, owner acceptance, rollback-механизм; **после этого** объявлять сайт доступным.

## Откат

- Если Caddy reload / auth / favicon / статика / Main Design Zavod вызывает ошибку: немедленно вернуть проверенную исходную конфигурацию из бэкапа и reload Caddy.
- Независимо от этого отдельный \`garant-bani-preview/current\` можно перевести на предыдущую версию (если она существует) или отключить route. Не удалять текущий релиз «Диззавода».
- Важна проверка не только preview, но и legacy домена, lead relay и здоровья Horizon 12.

## Приёмочный STOP

- Нет owner GO на текущую server phase.
- Shared server Caddy нельзя валидировать / разметка host отличается от review.
- Неизвестные login/password/hash в репозитории, preview открыт без авторизации при требовании приватности.
- Конструктор вызывает внешний API или \`/api/lead\`, форма отправляет ПДн.
- Ломается существующий сайт или MAX lead relay.
- Не удаётся подтвердить путь/права/rollback перед reload.

## Когда снять preview

После отдельного согласования собственного домена «Гарант Бани» и production lead-relay в MAX. Пока — только частный визуальный sandbox и user acceptance; никакой поисковой индексации и живых продаж.

**Контракт:** точное изменение маршрутизации на production сервере требует отдельного согласия, нельзя утверждать, что оно уже сделано. 
