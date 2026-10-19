# V74 — единая матрица приёмки, доказательства, релиз и откат
**Золотое правило:** `NOT_RUN`/ `PENDING` не являются `PASS`. Нельзя объявлять V74 готовым из-за прохождения только исходных 182 тестов V73. Сквозная программа охватывает реальную продуктовую ценность.

## 1. Продуктовые ворота
| Gate | Объект | Что должно быть PASS | Ответственный | Evidence |
|---|---|---|---|---|
| G0 | Source provenance | новая интеграционная ветка стартовала от production V73 SHA, PR issue/commit chain прослеживается | R8 | git log, manifest, issue |
| G1 | Первый экран | H1, lead, две CTA и 3 proof полностью в desktop viewport без скролла на 1366×768, 1440×900, 1536×864, 1920×1080 при 100% | R1/R2 | browser bounding boxes + screenshot |
| G2 | Широкий/узкий viewport | парадокс «на меньшем больше влезает» измерен и исправлен; media queries по ширине/высоте не создают скрытых кнопок | R2 | before/after metrics |
| G3 | Mobile CTA | fixed CTA не перекрывает формы/галерею; первый hero читаем на 320–430, обычная прокрутка работает | R2/R8 | screen matrix |
| G4 | Базовая цена | все 20 SKU согласованы owner; публичные цены кратны 5k, не ниже экономического baseline; сумма от модели = минимум | R3/R0 | matrix+unit |
| G5 | Сквозной quote | HTML/JS/server/quote/Saved lead/SEO совпадают, old V73 versions не переписаны | R3/R8 | integration tests |
| G6 | «Что входит» | 4 модельные карточки открывают состав базы выбранной модели; цена доступна, не ложная ссылка | R1/R2/R4 | keyboard/mobile QA |
| G7 | Text/typo | нет внутренних формулировок, унылых дублирующих вставок; логичные переносы, корректная стилистика | R4/R2/R0 | inventory+screens |
| G8 | Конфигуратор Q1 | на каждом шаге визуальный контекст, цена, модель, размер и action понятны | R5/R2 | E2E 4 models |
| G9 | Планировка/цвета Q2 | 20 размеров дают нужную версию плана, если подтверждена; цвет/кровля показываются достоверно или есть честный fallback | R5/R6/R7/R0 | manifest+screens |
| G10 | Фото Q3 | владелец утвердил реальные/проверенные кадры всех публичных моделей, нет смешанных интерьеров и вымышленной геометрии | R6/R7/R0 | hash manifest+approval |
| G11 | Опции Q3 | A/B/C mapping по значимым опциям, совместимость, объяснение и правильная цена | R5/R7 | unit/E2E |
| G12 | Доступность | клавиатура, focus, modals, 200% zoom, reduced motion, no horizontal scrolling | R2/R8 | axe/manual screenshots |
| G13 | SEO / GEO | 9+ публичных canonical URLs, JSON-LD truth, sitemap, robots, noindex для consent/manager, все ссылки/OG доступны | R4/R8 | SEO smoke |
| G14 | Надёжность | форма принимает при согласии, отклоняет без; SQLite сохраняет единожды, MAX ошибки не объявляются доставкой; manager 401/session/CSRF preserved | R8 | isolated smoke |
| G15 | Финальный релиз | SHA pinned; backup + restore rehearsal PASS; staging URL; один API+web switch, HTTPS postcheck, безопасный rollback, нет потери лидов | R8/R0 | release log |
| G16 | Owner signoff | owner отмечает цены, hero, copy, media, config, мобильный вид, готовность к трафику | R0 | signoff |
Любой `NO-GO` по G1/G4/G5/G10/G14/G15/G16 блокирует выход единого V74.

## 2. Матрица экранов: browser QA
**Desktop (обязательный first viewport):** `1366×768`, `1440×900`, `1536×864`, `1920×1080`; доп. край `1280×720`. Для каждой пары проверять sun/rain, фиксировать screenshot `before`/ `after`.
**Mobile:** `320×700`, `360×780`, `375×812`, `390×844`, `430×932`, `768×900`, `851×900`; проверка touch, sticky CTA, modal scroll.
**Zoom:** desktop `90/100/110%` (принимается настройкой browser zoom, не эмуляцией CSS transform), дополнительно `200%` и крупные системные шрифты на предмет переполнения и доступности. Для 200% допускается естественный scroll, нельзя скрывать CTA.
**Browser:** Chromium как обязательный, Firefox/WebKit как кроссбраузерная валидация где доступны; Safari/iOS и Android Chrome на реальных устройствах через owner/QA. Устройства/версии указывать в отчете, не угадывать.
**Локализация:** ru-RU с реальными пробелами/разделителями цены; HTML и JS reading; текст без переноса внутри «Но разница — в конструкции» на desktop baseline, но без текстового clipping на mobile.

### First-screen DOM-assert
For `#heroTitle`, `.hero-lead`, `.hero-actions a:first-child`, `.hero-actions a:last-child`, `.hero-proof`, `#heroMedia`, и `.header` записать `top,bottom,left,right,width,height,visibility,position`. Условие G1: после `scrollTo(0,0)` `getBoundingClientRect().bottom <= window.innerHeight - 8`, `top >= 0` для обеих CTA и proof, элемент не закрыт sticky overlay, `elementFromPoint` по центру CTA возвращает сам CTA/ребёнка, ссылки работают. При изменениях шрифта, фото и прокрутки повторить. Измерять `visualViewport` если доступно.
**Не скрывать** proof/CTA ради теста с `display:none`/ `overflow:hidden` или перемещать CTA только в fixed overlay и называть это выполненным first viewport.
**Скролл-логика:** секции имеют последовательную навигацию и ясный next-action, не должны жёстко snap на viewport при screen reader/zoom.

### Цикл экранного аудита по всему сайту
1. Hero: headline, photo, weather switch, CTA, proof.
2. «Почему» / сравнение: заголовки, смысловые стыки.
3. Каталог: 4 карточки, выбранный размер/видимая цена, переход к базе.
4. Базовая комплектация: 19 фактов, группировка и модельно-специфичные пояснения.
5. Skyline: сохранить/изменить/убрать с бизнес-обоснованием.
6. Комплект «Комфорт»: визуальные выгоды, единая согласованная цена и CTA.
7. «Ваша баня — ваши правила»: персонализация не подменяет заводские особенности.
8. Доставка: включено vs отдельно, полевые реалии, доступность CTA.
9. Конфигуратор: 7 шагов, всегда понятный progress/previous/back, visual, valid selection and price.
10. FAQ, social proofs, final CTA, footer, legal pages.
Для каждого: 1 скрин mobile + desktop, задача блока и измеримый пользовательский outcome.

## 3. Функциональные e2e сценарии
**Flow A / база:** home → каталог Квадро/Парус/Викинг/Квадро Хаус → «что входит» → модельно-специфичные условия → выбрать → шаг size → base public total vs HTML vs quote.
**Flow B / конфигурация:** каждая из 4 моделей, 5 размеров, изменение цвета корпуса и кровли, preview A/B/C, добавить/убрать опцию, возврат шаг назад, валюты, сверка итога с сервером и отсутствием double-charge.
**Flow C / Комфорт:** комплект Квадро 5м, внутри подобранный набор (без «12 дополнений»), верная коммерческая цена, индивидуальное изменение, пересчёт и сохранение выбранного.
**Flow D / форма:** mobile callback phone-only, consent SHA/version, rate limit, duplicate submission, fake MAX delivery (без реального сообщения), SQLite persistent evidence, менеджерская видимость, status patches + CSRF; задействованы оба старый и новый pricebookVersion.
**Flow E / SEO:** домашняя first paint, canonical, /bani/, 4 модели, /voprosy/, /kontakty/, /dostavka/, dynamic links, OG, llms/sitemap/robots; никаких fake offers, рейтингов/отзывов/адресов.
**Flow F / отказ:** загрузка картинки недоступна, планы нет/цвет недоступен, сервер 5xx, MAX 5xx, плохое соединение/перезапуск relay, обратная совместимость; интерфейс не обещает готовую несуществующую визуализацию и не объявляет failed POST успехом.

## 4. Условия автоматизации
- `npm run check` (существующие V73 182 теста — baseline, не заменяет V74 acceptance).
- `python tests/browser_mobile_acceptance.py` с моковым `/api/lead` и `LEADS=0`.
- `python tests/browser_v74_first_viewport.py` — новая строгая desktop/zoom/rain acceptance для G1/G2.
- `node --test tests/v74-*.test.mjs` — цена, base-to-card, language, manifest, visual resolver, compatibility, quote security.
- `python tests/browser_v74_configurator.py` — реальный браузер и изменения визуального состояния и цены.
- `python tests/browser_search_smoke.py` — SEO routes.
- R8 обязан задокументировать **фактически запущенные** команды, путь браузера, SHA и failures. `SKIPPED` не `PASS`.
- Никаких тестовых POST на production до отдельного явного согласия владельца; мокируйте MAX/SQLite локально.

## 5. Evidence и отчётность
В `docs/v74/artifacts/<workstream>/REPORT.md` указывать:
```text
BASE_SHA=...
HEAD_SHA=...
ISSUE=...
PR=...
FILES_CHANGED=...
OWNER_DECISIONS=...
TEST_COMMAND=...
TEST_RESULT=PASS | FAIL | SKIPPED | NOT_RUN
VIEWPORT=width x height, zoom, theme, UA
SCREENSHOT_BEFORE=...
SCREENSHOT_AFTER=...
VALUE_BEFORE=...
VALUE_AFTER=...
BLOCKERS=...
ROLLBACK=...
HANDOFF_TO=...
```
Скриншоты в web browser должны быть привязаны к фактическому source SHA и matrix id. Не коммитить логи с клиентским телефоном или настоящими заявками. Не генерировать фиктивные PASS-маркеры ради dashboard.

## 6. PR dependency и упаковка одного V74
`base production V73 SHA 34a370a3...` → `plan/v74-customer-experience-20261019` (сначала docs) → независимые PR геро/копирайта/прайса/состава базы/конструктора/медиа → V74 integration RC (единственный SHA) → **изолированная** PG/SQLite? Проект бань использует **только SQLite**, не PG. Не вводить новую БД. → isolated SQLite + fake MAX + manager auth smoke → preflight production read-only → owner GO → server backup + restore rehearsal → atomic API/web deploy → HTTPS check → post-launch manager/accessibility → safe rollback.
**Не** переносить серверные creds/cert/CA; не трогать маршруты Horizon12/FinDir и другие системы общего сервера. Использовать именованные каталоги релиза и разрешённые пути. При повторном развёртывании fail closed если checksum/active releases не соответствуют ожиданиям.
Не использовать старый R2 install для V74; новый релизный установщик требует собственного threat-model, per-source SHA, timeouts+ready checks, full rollback both links, ensure `previous` is actual V73.
Если во время prod deploy `Connection refused` — ждать bounded readiness и проверять фактический status, не бесконечные retries. `BACKUP=PASS`, `RESTORE_REHEARSAL=PASS` обязательны перед переключением.
**Production cutoff:** один переход API+WEB, без временных рассогласованных цен, сохранение SQLite и разрешённых Caddy/OG. Callback/manager auth остаются защитными инвариантами.

## 7. STOP/GO матрица
- `STOP`: нет owner signoff для 20 цен/готового комплекта; лишняя «скидка»; нет утвержденного фото/плана при обещанной визуализации; тесты FAIL; неверные quote; manager 200 вместо 401 анониму; дубли заявок; старые лиды пересчитаны; часы/доступ/CTA режутся на mobile; indexability/legal broken; backup/restore missing.
- `HOLD`: media designer ожидает материалов, нужен отдельный owner decision — можно завершать независимые разработки, но не выпускать единый V74.
- `GO`: G0–G16 PASS, owner подписал explicit command, release manifest pinned, rehearsal/rollback pass.
- Post-launch: показать номер/точный SHA активного релиза и результаты проверок, не считать их успешными до получения лога; реальное MAX end-to-end только после отдельного согласия.

## 8. Обратный откат
План отката обязан хранить **прежние symlink targets**, исходный manifest цены и копию SQLite, проверить пути/backup checksums и исключить очистку/удаление лидов. В случае падения API сначала проверяем здоровье старого relay, потом остальную публичную часть; защищённый кабинет должен отвечать 401 анонимно. После rollback расчёт действующих цен и согласия возвращается к snapshot V73. В docs указать exact command из успешно пройденной rehearsal, а не выдумывать его заранее.
