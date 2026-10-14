# КВАДРО READY — мультисайтовый backend, кабинет менеджера и MAX: технический контракт v1
Дата 2026-10-14. Статус SPEC ONLY. Основание: точный V7.1 SHA 2f45023390609adce1e514990f42c495cee01c37 и код в ветке feat/v71-parus-landscape-gallery. НИ ОДНОЙ серверной операции по этому документу ещё не выполнено.

## 1. Аудит уже существующих компонентов (факты из кода)
- server/garant-bani-relay.mjs: POST /api/lead с обязательным точным Origin=ALLOWED_ORIGIN, JSON, consent, cookie не используется для публичного POST, rate limiting, persisted SQLite before MAX, идемпотентность requestId, 8-KB ограничение на payload.
- server/lead-store.mjs: SQLite WAL, таблицы leads/lead_events, UNIQUE(request_id), созданная заявка с ID GB-YYYYMMDD-XXXXXXXX, поля status/assignee/manager_note/notification_status/snapshot_json.
- server/manager-api.mjs: POST login/logout, GET session/leads/leads/:id, PATCH leads/:id, персональный cookie менеджера, проверка Origin для записи, сессия создана в manager-auth.mjs.
- manager.html + assets/js/manager.js: единый список без site-id; статусы new/in_progress/awaiting_customer/quote_sent/won/lost; карточка знает только estimate каталога и flow callback/quote.
- MAX: один API вызов из relay, отдельный notification_status=pending/delivered/failed, логика не теряет запись при ошибке MAX; но текущий публичный POST при неудачной доставке возвращает 502 даже когда SQLite записала лид, что требует корректного UX/retry в новом маршруте.
- docs/MANAGER-LEADS.md: постоянная БД /var/lib/garant-bani-relay/leads.sqlite; сайт /bani-preview/, кабинет manager.html, relay 127.0.0.1:3301, manager login две технические учётки; реальные пути/версии живого окружения подтвердить read-only до модификаций.
- docs/V66-DOMAIN-MIGRATION.md: SITE_BASE_PATH и ALLOWED_ORIGIN сейчас сконструированы для одного источника; исторические cookie и database должны сохраняться при переносах.
- Несовместимость с новым продуктом без изменений: validateBaniLead требует старую configuration с modelId, sizeId и optionIds, а source_site не хранится в колонке БД; фильтра по сайту нет.

## 2. Архитектурное решение и сервисные границы
Один узел LEADS CORE, один постоянный SQLite, один manager API, один MAX transport. N статических витрин — физически обособленные frontend entries. Не копировать отдельно базы, менеджеров, bot credentials и бизнес-статусы.
Не импортировать код конструктора в QUADRO READY frontend. API/Storage — единственный общий модуль.
Топология MVP:
  Site A: /bani-preview/ -> POST /bani-preview/api/lead -> proxy -> relay /api/lead (legacy, unchanged)
  Site B preview: /quadro-ready-preview/ -> POST /quadro-ready-preview/api/leads/quadro-ready -> proxy -> relay /api/leads/quadro-ready
  Site B live (после GO): https://дачапар.рф/kvadro/ -> POST /kvadro/api/leads/quadro-ready -> proxy -> relay /api/leads/quadro-ready
  Admin: current private manager.html -> /bani-preview/api/manager/* -> relay /api/manager/* (ТОЛЬКО защищённый маршрут менеджеров)
  Relay -> one SQLite -> one MAX chat.
Запрет: публичный сайт B не получает доступ к /api/manager/*; нет credentialed cross-origin fetch к менеджерскому кабинету с публичного домена.
Разные статические релизы развертывать независимо; relay отдельно версионировать. Статическое дерево READY не смешивать с деревом сайта A, кроме совместно версионируемого API контракта.
Возможная структура исходников: quadro-ready/index.html, quadro-ready/assets/{css,js,images}, quadro-ready/privacy.html, quadro-ready/consent.html, quadro-ready/data/read-only-product.json; server/site-registry.mjs, server/ready-lead-validation.mjs, server/notification-queue.mjs (если понадобится) и расширение server/lead-store.mjs, server/manager-api.mjs, assets/js/manager.js. Имена конкретизировать на первых PR; держать backward-compatible.

## 3. Trusted site registry / маршрутизация
Реестр сайтов на сервере: siteId, displayName, acceptedOrigins[], allowedLeadPaths[], canonicalLanding, enabled. Значения siteId: garant-bani, quadro-ready. Для дальнейших сайтов добавление записи + адаптера продукта, без новых БД/кабинетов.
site_id устанавливается на сервере из точного маршрута и проверенной конфигурации origin; поле siteId в JSON браузера не является источником истины. Также не доверять клиентским Host/X-Forwarded-* без нормализации доверенным proxy.
Legacy POST /api/lead всегда маппится на garant-bani, весь payload и ответ совместимы. New POST /api/leads/quadro-ready всегда маппится на quadro-ready и проверяет: Origin относится к белому списку siteId; разрешённый маршрут; Content-Type JSON; строгую схему; body <= лимита; rate limit; consent; session для public lead не требуется.
Caddy/Nginx: все публичные /api/leads/QUADRO и /api/lead — маршруты только внутри соответствующего HTTPS хоста и защищённого exact prefix, без wildcard reverse proxy; config validate + old route snapshot. Публиковать /health наружу только если предусмотрено штатным маршрутом. Состояние чужих сайтов /api/lead, /api/analytics/event сохранять byte-for-byte.
Новый домен не требует включать CORS '*': browser отправляет same-origin request на собственный /kvadro/api/...; reverse proxy внутри сервера направляет к одному private loopback. Cookies manager только на manager origin с HttpOnly/Secure/SameSite=Strict и ограниченным Path. В междоменный cookie не превращать.

## 4. Новый product lead contract (предложение v1)
Route: POST /api/leads/quadro-ready, application/json, exact origin.
Поля клиента:
  requestId: UUID v4 от браузера, стабилен для повтора;
  flow: 'quote' или 'callback';
  product: {sku:'QR-5-READY'|'QR-6-READY', finishId:<allowlisted id>};
  district: нормализованный населённый пункт/район (для quote);
  site: {base:'unknown'|'ready'|'advice', access:'unknown'|'yes'|'advice'} (по умолчанию unknown, допустим callback без блока);
  customer: {name,phone,contactChannel:'phone'|'telegram'|'max',comment?};
  consent: {accepted:true,version:<утверждённый exact version>};
  tracking: {landingPath?,referrer?,utmSource?,utmMedium?,utmCampaign?,utmContent?,utmTerm?,clickId?};
  website: honeypot string empty.
SERVER COMPUTED (клиент не принимает решений): sourceSite='quadro-ready'; productName='КВАДРО READY'; size=5/6 м; width=2.1; fixedPackage='READY'; productPriceRub из active validated product catalog; priceVersion; priceApprovalStatus; discountStatus; created_at and request event. Любая цена/вариант скидки в JSON клиента игнорируется либо отклоняется; запрещена запись подменённой сметы.
Контакт: phone normalize +79XXXXXXXXX, строгие max lengths и escaping, no direct HTML interpolation; phone country current Russia. Поле comments с нормализацией; ни одна метка аналитики не может переписать sourceSite или business status.
В compatibility layer хранить также flow и snapshot_json так, чтобы кабинет мог читать старые и новые записи через discriminate productKind='catalog-configurator'|'ready-fixed'. Нельзя притворяться, что READY — это legacy quoteEngine optionIds: это разные типы заявки.
Пример безопасного ответа при сохранённой записи и успешной MAX: HTTP 201 {ok:true,persisted:true,leadId:'GB-...',notificationStatus:'delivered',duplicate:false}.
Сохранено, но MAX не доставлено: HTTP 202 {ok:true,persisted:true,leadId:'GB-...',notificationStatus:'pending'|'failed',duplicate:false}; UI сообщает успех сохранения, а не отправки MAX. Переотправка MAX — серверная очередь/действие менеджера. Старый /api/lead не меняет семантику без отдельного совместимого релиза и тестов.
Повтор с тем же requestId и идентичным payload -> 200 {ok:true,persisted:true,duplicate:true,leadId:original}; одинаковый requestId и ДРУГОЙ payload -> 409 REQUEST_ID_CONFLICT. Проверять и происхождение siteId, не допускать cross-site collision -> дубли/незаконный доступ. Повторное уведомление MAX не генерировать, если уже delivered.
Некорректная конфигурация -> 422; origin mismatch -> 403; превышен лимит -> 413; rate limit -> 429; storage failure -> 503 с честным сообщением. При 5xx до подтверждения клиент сохраняет введённые поля и тот же requestId.

## 5. Миграция БД без потерь
До изменения: exact runtime SHA, current DB location/owner/perms, размер, SQLite backup API (WAL-aware), PRAGMA integrity_check, исходные counts по leads/events, поддержка восстановления.
Миграция только additive с PRAGMA user_version/migrations table, под эксклюзивной транзакцией, без DROP/RECREATE существующих leads и без write по всем snapshot_json:
- leads.source_site TEXT NOT NULL DEFAULT 'garant-bani';
- leads.product_kind TEXT NOT NULL DEFAULT 'catalog-configurator';
- leads.product_sku TEXT NULL;
- leads.price_version TEXT NULL;
- leads.tracking_json TEXT NULL (PII-safe, ограниченный size, не записывать без consent/need).
- индекс leads(source_site, status, created_at DESC), отдельный index для product_sku при доказанной необходимости.
- запись created event «Источником является КВАДРО READY» для новых лидов, историю старых НЕ переписывать.
Для старых callback product_kind лучше legacy 'catalog-configurator' / 'legacy' и UI корректно отображает отсутствие размера; миграцию спроектировать так, чтобы все старые карточки/поиски продолжили работать.
Сохранить существующие ID GB-... и UNIQUE request_id, статусы и ассоциированные lead_events.
Никакого второго активного SQLite файла и никакого копирования WAL через cp на работающем сервисе.
Schema down migration запрещена: rollback к последнему совместимому backend; если нужны breaking modifications — expand/contract в разных релизах.
Проверка: одинаковые counts, не изменились timestamps, assignees, events, карточки 5 исторических заявок, manager auth и MAX.

## 6. Кабинет менеджера
Один существующий manager.html, общий логин/сессии, дополнительный верхний tab/filter (не создавать независимый manager для READY):
- Все заявки (default)
- Гарант Бани
- КВАДРО READY
В каждой вкладке независимый фильтр статуса, поиск, пагинация, число заявок. Сайт источника — badge/текст на карточке, не в отдельном цветном status badge. URL-state site query поддерживать, но очистка/смена сессии не должны показывать кеш чужой заявки.
GET /api/manager/leads?site=all|garant-bani|quadro-ready&status=...&q=...&limit=...&offset=...; фильтр site в SQL, никогда не фильтровать только на фронте поверх первой страницы.
Статистика по активному site + общее число; нулевая вкладка — нормальное состояние.
Карточка READY: сайт/домен/страница, ID, дата, размер 5/6, цвет, фиксированный пакет, публичная цена snapshot и цена доставки: «не определена», статус расчёта/согласия, район, подъезд/основание, клиент, предпочитаемый канал, utm source/medium/campaign, MAX status, заметки и история; без legacy-таблицы доп.опций/скидок, если они не применимы.
Карточка Гарант Бани рендерится по старому пути с прежним estimate. Callback без configured product — безопасно и без «undefined».
Существующие роли и персональная авторизация остаются; никаких глобальных management endpoints на публичных хостах.
Статусы: new,in_progress,awaiting_customer,quote_sent,won,lost сохраняем. В будущем может появиться «расчёт доставки», пока это заметка/quote_sent.
Отмена, смена статусов, поиск, logout, истечение сессии, неправильный пароль, CSRF/Origin должны вести себя как прежде.

## 7. MAX: общий бот и общая группа
Один существующий токен и chatId остаются в root-only конфигурации; НЕ создавать второй бот. Новый шаблон уведомления:
  НОВАЯ ЗАЯВКА — КВАДРО READY
  Источник: КВАДРО READY (siteId)
  Номер: GB-...
  Размер: 5 м / 6 м; ширина: 2,1 м
  Цвет: ...
  Комплектация: READY (фиксированная)
  Цена изделия: 749 000 / 799 000 ₽ — статус 'предварительно' до APPROVED; доставка отдельно
  Клиент/телефон/способ связи
  Локация и доступ к участку
  Рекламный источник: utm_source/utm_campaign (санитизировать, ограничить)
  Кабинет: безопасная ссылка без токенов и ПДн, открывается только после логина.
Не передавать в MAX лишние личные данные, историю формы, ip, весь referrer, полный URL с query и клик-ID. Ошибка MAX = запись остаётся в DB и видна менеджеру. Нужен конечный алгоритм повторной отправки (outbox таблица или безопасная idempotent очередность) и инструмент видимости статуса, без бесконечного спама группы.
Проверить, не повторяет ли MAX доставку при retry в случае таймаута неизвестного исхода; политика UNKNOWN/RECONCILIATION и операционная инструкция обязательны. Тесты используют фейковый транспорт; реальные уведомления только по явному тестовому GO.

## 8. Рекламные метки / обработка ПДн
Source site is authoritative server computed. Referrer and UTM — данные клиента, только атрибуция с sanitization; не считать UTMs доказательством фактической платной кампании. В отдельных полях хранить site_id и sku, в snapshot — уже согласованную смету.
Events analytics: page_view, ready_size_select, ready_color_select, plan_view, full_specs_open, lead_form_open, lead_submit_attempt, lead_persisted_success (server), call_tap. В них никогда не отправлять имя/телефон/комментарий и чувствительные поля. Для server-side конверсии берём только успешную сохранённую заявку, для сделки — manager won.
Нужны Политика ПДн и отдельное согласие на новом домене со сверенным юрлицом, сроками хранения, целями и каналами доставки. Consent version/date/evidence сохранять. На preview noindex,nofollow, форма под паролем и возможность end-to-end sandbox.
Не раскрывать в публичном GitHub секреты: MAX_TOKEN, chat_id, credentials, телефоны клиентов, рабочий конфиг Caddy, реальные заявки.
Запретить click-to-call до утверждения номера: placeholder с подписью [НОМЕР ДОБАВИМ ПОСЛЕ УТВЕРЖДЕНИЯ] не должен быть кнопкой.

## 9. Поэтапные релизы (не делать единый рискованный switch)
R0 docs only — master spec + target contracts + task issues; NO PROD WRITES.
R1 read-only production inventory — точный runtime SHA, HTML пути, API, SQLite schema, Caddy маршруты, current backups, MAX, юридические страницы. Все проверки без mutation.
R2 backend expand in isolated dev + compatibility tests — добавление site_id и маршрута /api/leads/quadro-ready; старый контракт неизменен. Тесты localhost и временная DB, никаких живых клиентов.
R3 manager tab — списки, фильтры, карточка READY на новой модели; тесты старых заявок; SSR/Origin/login smoke.
R4 separate static site build — готовая страница, placeholders, общая форма и фиктивный транспорт в локальном режиме; без публикации на действующем домене.
R5 combined local E2E — обоими сайтами в одну ТЕСТОВУЮ DB и mock MAX; negative security flows, screenshots 320-1440.
R6 server staged — owner-approved backup and rollback, новые /quadro-ready-preview/ маршруты под BasicAuth, отдельная статическая директория и staging backend; старые публичные пути не меняются.
R7 owner QA — реальные фото/комплектация, approved 5/6 prices and legal copy, tests на кабинете и MAX. Отдельный MAX live test с тестовыми данными, без спама.
R8 public GO — отдельно согласовать DNS/HTTPS дачапар.рф, стабильный host, privacy and consent, phone, price approved, 200 health and 401 unauthorized manager, rollback windows and log review. Только после owner GO и сохранённой возможности rollback.
Не использовать GitHub Actions как обязательный release gate; runtime/deploy only через согласованный PowerShell + SSH sudo по инструкции владельца; другие проекты на сервере не трогать.

## 10. Матрица тестирования
A backward compat: 5 старых форм (legacy/no consentVersion/current), 2 callback, 2 manager accounts, старые 6 статусов, история и пагинация.
B new READY: 2 размера × 3 цвета = 6 комбинаций, смена размера, цена и SKU; 3 сценария состояния доставки/основания.
C auth/security: неверный Origin на оба endpoint, сайт A не создаёт READY лид, сайт B не отправляет generic quote, публичный API не открывает manager, cookie session expiry, OPTIONS/CORS preflight не допускает чужое, password throttle, CSRF.
D storage: повтор по requestId, collision другого site, simultaneous submit, DB locked, WAL/backup/restore, crash между insert и MAX, MAX timeout.
E MAX: happy, failure and delayed success, повторная отправка только по политике, корректный заголовок источника, отсутствие реальных клиентских данных в test-run.
F performance/UX: 320/375/390/430/768/1280/1440, keyboard-only, a11y, no CLS over hero photo, fast LCP, images lazy loaded except hero, no hero slider heavy, all CTA lead success.
G legal/SEO: preview noindex, live only indexable after GO, canonical/robots/sitemap, place-holder phone nonclickable, final actual company details and privacy/consent.
H operations: rollback only new code/route, keep SQLite forward schema+records, old site functional 200 and same form/manager/MAX, verification metrics and observability.

## 11. DoD
- Схема единого multi-site хранит старые и новые записи, без потери/смешения и с точным source site.
- Все публичные POST проходят только через approved origin/path; один доверенный backend.
- Подключён один кабинет с фильтрами и одной группой MAX; новая карточка READY независима от quote-engine каталога.
- Нет false-success: сохранено означает persisted, MAX notification отдельно.
- Документированы раздельные deploy/rollback старого сайта, READY сайта и relay; есть доказательства QA и отдельный owner GO.
