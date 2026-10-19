# V74 — роли, зоны ответственности и передача результатов
**Версия документа:** 19.10.2026. Ролевое распределение для `s-yarushkin/site_bochki`. Каждая роль работает в своей ветке/PR от V74 integration, а не от устаревшего `main`. Владелец создаёт отдельного дизайнера для медиа.

## Правила для всех ролей
1. Взять репозиторий, прочитать [master spec](README.md), относящийся контракт, issue и исторические тесты V73. Признать **source base SHA V73 `34a370a3daac5b742a93806c29effa542fccdef8`**, текущий integration SHA получать из GitHub перед созданием ветки. Не основываться на самом раннем `main` без согласования.
2. До кода сделать `BEFORE`-отчёт: что воспроизведено, viewport / модель / шаг / ввод / ожидаемый результат. Учитывать *отдельно* product/marketing/technical и source of truth; при неизвестной спецификации показать blocker.
3. Работать в узкой ветке `feat/v74-<role>-<topic>`, PR на интеграционную ветку `plan/v74-customer-experience-20261019` (до начала интеграции branch может быть переименована по отдельному согласованию). Никакого push в рабочие V73 релизы, Caddy, системный сервис и SQLite.
4. Каждый PR: `WHY / WHAT / FILES / NON-GOALS / RISK / TEST EVIDENCE / SCREENSHOTS / ROLLBACK / OWNER QUESTIONS`; attach hashes and filenames; merge только после независимого review. Точные цены поставщика, комиссии, данные клиентов и ключи — никогда.
5. Сдавать `docs/v74/artifacts/<workstream>/REPORT.md`, контрольный screenshot index, результаты авто- и ручных тестов, граф отклонений. Если доказательство отсутствует — `NOT_VERIFIED`, а не PASS.
6. Сохранять общие конверсионные и юридические инварианты V73: 4 модели, 20 размеров, серверные цены, mobile CTA, sun/rain, галереи, почта только для обращений, заявки в SQLite/MAX, login/CSRF/сессии менеджера, consent hash/versions.
7. Любые CI/scripts должны работать на Windows (LF/CRLF) и Linux без ослабления проверок. Тексты и метки тестов должны подтверждать смысл, не старое маркетинговое слово.

## R0 · Product Owner / Business Approver (человек)
**Отвечает:** окончательные коммерческие решения, список моделей, фотографии конкретных бань, реальные планы, формулировку качества и цены; GO/NO-GO; доступ в закрытый заводской каталог.
**Задачи:** утвердить новую клиентскую цену каждого из 20 базовых SKU и полную цену избранного комплекта; подтвердить «что входит» по моделям; создать роль дизайнера, дать ему техплан/оригиналы и принять изображения; просмотреть desktop+mobile; отметить в листе acceptance `APPROVED` или `REWORK`.
**Не делать:** размещать пароли/закупочные ставки/личные фото клиентов в issues; утверждать публичную схему без подтверждения производства.
**Выход:** `docs/v74/artifacts/07-integration/OWNER-SIGNOFF.md` с пунктами pricing/media/text/design/cutover; без коммерчески чувствительных данных.
**STOP:** нет подтверждённого планировочного решения, фото или цены, который нужен релизу.

## R1 · UX / Conversion Architect — ПЕРВАЯ РОЛЬ
**Отвечает:** сценарии посетителя и дизайн системы «виртуальных экранов»; видимость H1/CTA/01-02-03; очередность секций; действие после каждого блока; CAD-не занимается.
**Первый шаг:** воспроизвести hero на 1366×768/1440×900/1536×864/1920×1080 с 100% zoom, солнце и пасмурно; измерить `getBoundingClientRect` для `.header`, `#heroTitle`, `.hero-lead`, `.hero-actions a`, `.hero-proof`, `#heroMedia`; вычисленные padding/gaps/font/height; объяснить парадокс «меньший viewport вместительнее». Зафиксировать evidence до правки.
**Проект:** короткий лаконичный hero, CTA до scroll, 3 шага без лишнего текста, 2 варианта визуальной компоновки с tradeoffs. Карта последующих секций по смыслу; убрать ложные «виртуальные экраны», если они ухудшают естественную прокрутку.
**Сдача в `docs/v74/artifacts/01-hero`:** `baseline.md`, `viewport-matrix.csv`, `sections-map.md`, `design-decision.md`, скрины PNG/WebP со стандартным именем `before-1366x768-sun.png`/ `after-...`.
**Приёмка:** в пределах viewport полностью 2 CTA/3 шага на desktop target, при mobile нет перекрытия sticky CTA, клавиатура управляет, доступность/zoom не ломаются.
**Переход R1→R2:** точные CSS constraints и принятую композицию R2 реализует, R1 подтверждает screenshot diff.

## R2 · Frontend Layout / Accessibility Engineer
**Отвечает:** HTML/CSS/components UX, adaptive layout, текстовые переносы, visual viewport, респонсивность, светлая/пасмурная тема.
**Вход:** утверждённая UX-композиция и измерения R1.
**Изменения:** минимальные селекторы `.hero`, `.hero-grid`, `.hero-copy`, `.hero-actions`, `.hero-proof`, `.hero-image`, layout media @max-height; не маскировать дефект overflow:hidden. Для универсальных секций применять гибкие `min-height`, `scroll-margin`, container queries или breakpoint-и по высоте, если измерения оправдывают. Проверить z-index, interactive hit areas, sticky header, old fallback fonts, prefers-reduced-motion. Добавить browser QA уровня DOM.
**Сдача:** PR CSS/HTML с привязанной матрицей; `tests/browser_v74_first_viewport.py` с чёткими assert; отдельные снимки 90/100/110% zoom; статические тесты текущих CSS компонентов. `artifacts/01-hero/REPORT.md`.
**STOP:** любой clipping контента на 320px, скрытые CTA при 1366×768, новый горизонтальный скролл, broken rain/sun.

## R3 · Pricing / Commercial Engine Engineer
**Вход:** публичная матрица 20 точных баз V73, владелец принимает округлённую матрицу, PRICE-CONTRACT.
**Отвечает:** преобразование pricing baseline → **единый утверждённый публичный прайсбук**; server/quotes/SEO/gallery; legacy history.
**Техническое:** считать 20 round-up to 5000 цены из подтверждённых точных публичных V73, создать ревизию pricebook, не менять `legacy-*`; версионировать источники; синхронизировать `data/catalog-pricebook.json`, `data/pricebook.js`, `assets/js/quote-engine.js`, `server/garant-bani-relay.mjs`, SEO generation and generated pages, HTML first paint; отдельное правило для curated package (не допустить скрытого расхождения и ложной скидки). Цена в заявке берётся только от server, не от клиента.
**Сдача:** `docs/v74/artifacts/02-pricing/20-sku-public-approval.md` только публичные цены; `price-diff.csv` с публичными значениями; тесты для каждого SKU и всех согласованных комплектов; rollback/version map.
**STOP:** хотя бы одна неправильная цена/комплект, невязка pre-JS и post-JS, восстановление старой заявки по неверной версии, раскрытие приватной экономики.

## R4 · Customer Copy / Conversion Content
**Вход:** список всех блоков из R1 и согласованное позиционирование.
**Зона:** title, body, captions, CTA, FAQ, aria, SEO, ошибки/пустые состояния конфигуратора. Проводит редактирование `index.html` и текстовых модулей JS + SEO generator, не только финального HTML.
**Сдача:** `artifacts/04-copy-type/content-inventory.csv` (route, selector, текущий текст, проблема, новая редакция, подтверждённый факт, ожидаемое действие), `approved-copy.md`, grep-rule/test prohibited-jargon.
**STOP:** обещание включённых услуг/моделей без подтверждения, техничка покупателю, стихийная потеря SEO-содержания. Согласовать удаление skyline до кода.

## R5 · Configurator Architect / Product Engineer
**Вход:** price contract, согласованные IDs, media inventory, ограничения производства.
**Зона:** `state` и transitions (model→size→finish→roof→extras→preview→quote), схема `data/config-visual-manifest.json`, selectors and fallback, виджет планировки, A/B/C визуальные реакции, принятие реальных size plans.
**Сдача:** `artifacts/05-configurator/state-map.md`, `supported-combinations.csv` и интерфейсную спецификацию; опытный FE с рабочей реакцией **на реальные ресурсы**; unit+browser tests. Визуал preview не является источником истины для цены.
**STOP:** изображение не соответствует выбранному sku, невозможная дверь, несовместимый вариант, недостоверная геометрия/палитра, selectable вариант без provenance.

## R6 · Product Media Designer — назначает владелец
**Вход:** фото и производственные планы, `docs/v74/MEDIA-CONTRACT.md`, утверждённый shotlist.
**Зона:** обложки, экстерьеры/интерьеры, ракурсы, цветовые варианты, кадры опций; единая форма изделия; света/тени/текстуры/конструкция правдоподобны; исходник никогда не содержит текст.
**Сдача:** source masters в закрытом/согласованном месте и публично допустимые exports; таблица provenance (real photo/edited/synthetic visualization); матрица `model-size-finish-roof-view`; owner QA пометка по кадру. Не публиковать исходники, если запрет на распространение.
**STOP:** смешаны разные бани, чужой интерьер/форма, несогласованная геометрия, ложное указание «реальная фотография».

## R7 · Media Integration / Image Performance Engineer
**Вход:** полностью принятые R0/R6 assets, манифест R5.
**Зона:** стабильные filenames и hashes, responsive image sizes/formats WebP/AVIF, правильный crop/fallback, отдельная галерея каждой модели, `loading`/LCP, preview transitions.
**Сдача:** `assets/configurator/`, `assets/catalog-v74/`, манифест, hash inventory, тест отсутствия бракованных slots и дублированных интерьеров; before/after browser QA 320–1920; sitemap/assets links.
**STOP:** 404, лишний вес, фото одно для другой модели, сломанная weather галерея, missing alt, фиктивный «цвет товара» без отрисовки.

## R8 · Integrated QA / Release & Safety Lead
**Вход:** все рольные PR, final 20-SKU owner approval, signed media manifest и ручной UX signoff.
**Зона:** интеграция без переписывания ядра, prior V73 regression, screenshot QA, web/relay/manager/SEO security, reproducible build, protected SQLite/Caddy, rollout/rollback, documentation.
**Сдача:** `artifacts/07-integration/release-candidate.md`, `acceptance-results.csv`, `rollout-manifest.json` без secrets, `backup-rehearsal.md`, четко выверенные exact SHA, `production-postcheck.md`, `owner-signoff.md`. Имитировать MAX в тесте; реальная отправка только отдельное разрешение владельца.
**STOP:** нет preflight PASS, backup restore не проверен, несовместимые версии тарифов, отсутствие manager auth, личные данные в логах, непроверенный rollback.

## RACI — кто принимает что
| Результат | Responsible | Accountable/Sign-off | Consulted |
|---|---|---|---|
| Hero, виртуальные экраны | R1+R2 | R0 | R4,R8 |
| Курс публичной цены, целостность quote | R3 | R0 | R8 |
| UX «что входит в стоимость» | R1+R2 | R0 | R3,R4 |
| Полная редактура | R4 | R0 | R1,R8 |
| Машина конфигуратора | R5 | R0 | R3,R6,R8 |
| Фото и планы | R6 | R0 | производство,R5,R7 |
| Внедрение ассетов | R7 | R0 | R5,R8 |
| Единая приёмка, релиз | R8 | R0 | все роли |

## Handoff: строгое определение
Смена роли/задачи не означает завершение. Handoff проходит только после:
1. `DELIVERABLES` with paths/hash, `TESTS` exact commands and results.
2. `KNOWN_GAPS` and `APPROVAL_REQUIRED` (пустые лишь если действительно нет).
3. `INVARIANTS` проверенные и не проверенные (разделять).
4. `NEXT_ROLE_ENTRY_CRITERIA`; PR/base/head SHA.
5. Письменного review со стороны принимающей роли/owner для пользовательских решений.
