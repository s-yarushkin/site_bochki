# КВАДРО READY — инженерный roadmap и атомарные задачи (v1)
Дата 2026-10-14. SPEC ONLY. Не запускать release/deploy без owner GO. Читается вместе с docs/QUADRO-READY-SITE-SPEC.md и docs/QUADRO-READY-MULTISITE-ARCHITECTURE.md.
Точки отсчёта: working production lineage V7.1 feat/v71-parus-landscape-gallery SHA 2f45023390609adce1e514990f42c495cee01c37. Ветка docs/... создана поверх неё. Основной main репозитория исторически отстаёт от V7.1, поэтому недопустимо мержить прямой diff на main без явного расчёта базы.

## Правила выполнения
- Задачи маленькие, одна ответственность — один отдельный PR (или 2-4 строго связных атомарных пункта с тестами).
- Backend foundation -> compatible migration -> API -> manager -> static site -> full tests -> staged release; сквозной контроль после каждой фазы.
- PR всегда draft до подтверждения испытаний; статус Code Ready не равен Production GO.
- Не изменять Google Sheets, существующий runtime, Caddy, SQLite и MAX при выполнении этапов SPEC/R1–R5. Любой серверный gate через согласованный owner PowerShell/SSH с read-only preflight и rollback. Диззавод, Horizon-12, FinDir и прочие приложения не трогать.
- Для каждого PR: точный base HEAD, Scope/Invariants, Changed files, Test commands + PASS evidence, screenshots при UI, Rollback, Unknowns, Owner acceptance.
- Unconfirmed values are UNKNOWN, not guessed: phone, exact stove, net selling price, color palette availability, useful internal dimensions, typical foundation spec.
- Внешние фото только реально относящиеся к этому изделию. При отсутствии — подписанная заглушка.

## Этап T0 — база/инвентаризация (P0 до кода)
- QR-001 Read-only tree + runtime inventory: README/source branch, Caddy routing, site current and previous symlinks, relay exact SHA, DB file/WAL schema, live health, manager 401, MAX status (без отправок). Output: AS-IS vs TO-BE diff и затрагиваемые файлы.
- QR-002 Canonical source decision: V7.1 checkout as base; определить master feature branch и правила downstream PR; no direct main fast-forward.
- QR-003 Freeze source documentation: заключить точный API old-form, no-regression acceptance / existing logs; canonical 5 historical test snapshot data with anonymization.
- QR-004 Product review: собрать список товаров из фотографии и заводского 17-позиционного списка, согласовать 2 SKU, записать ONLY verified tech attributes. Owner signs product acceptance.
DoD T0: одна диаграмма AS-IS, git SHAs, read-only inventory, zero prod changes.

## Этап T1 — данные и совместимость (P0)
- QR-005 Create product registry model SKU QR-5-READY, QR-6-READY, finish IDs and display-only statuses. Validate allowed size/finishes, prevent generic optionIds.
- QR-006 Create server-side price registry with status PROVISIONAL; price 749000/799000 for design, no public uncontrolled publish; discount flag OFF by default. Old catalog-pricebook untouched.
- QR-007 Add additive migration leads.source_site/product_kind/product_sku/price_version/tracking_json; historical default correct; user_version, WAL backup contract. No old records rewritten.
- QR-008 Index + store list filters exact site_id and status, offset/limit; correct total/stats; no per-page client filter.
- QR-009 Implement new ready-lead validator: shape limits, phone +7, consent version, region, size, finish, honeypot and optional tracking. Legacy validator untouched.
- QR-010 Implement trusted server-side site registry/path+origin checking; disallow user-injected site, Host and X-Forwarded spoof.
- QR-011 Add POST /api/leads/quadro-ready preserving existing POST /api/lead exact semantics. Reprice server-side and save fixed-price snapshot.
- QR-012 New response semantics persisted:true+notificationStatus separate; duplicate requestId semantics, collision guard (cross-site too), error codes. Re-send behavior deterministic.
- QR-013 Create unit+integration tests for migrations (all historical rows preserved), validator negative paths, site registry, price snap, idempotency, SQLite locked/restarts and rollback compatibility.
DoD T1: old suite PASS + new negative tests PASS, temp DB only, source from server is authoritative, nothing deployed.

## Этап T2 — единый MAX (P0)
- QR-014 Build READY notification template with [КВАДРО READY], SKU, finish, price status, district, phone/channel and clickable protected manager URL; omit PII from link.
- QR-015 Define notification delivery state machine persisted before MAX; cover timeout/unknown outcome, no silent lost leads.
- QR-016 Implement bounded retry or manual retry procedure with event audit and dedupe; no duplicate group spam; keep same single existing chat/token.
- QR-017 Tests mock MAX success, HTTP failure, network timeout, 200 with bad body, stale retry, two source messages.
DoD T2: one bot only, MAX fail does not lose lead, tests never send to live group.

## Этап T3 — менеджер (P0)
- QR-018 Add tabs All/Garant Bani/КВАДРО READY in manager.html; preserve login/out, search, pagers, keyboard operation.
- QR-019 Wire site filter into GET /api/manager/leads and stats, SQL exact-site filtering; include site label in list cards.
- QR-020 Add discriminated READY detail rendering: size, finish, package READY, price snapshot/version, no legacy options, delivery unknown, note/assignee/history.
- QR-021 Preserve catalog detail display and callback without product; no undefined, no regressions to six statuses and search.
- QR-022 Site-filter browser smoke on 320/390/768/1440; auth 401, Origin 403, logout clears prior content; admin only under existing private route.
DoD T3: screenshots and tests for two source types and zero empty-edge regressions.

## Этап T4 — independent frontend shell (P0)
- QR-023 Separate static root quadro-ready/ with no old shared themes/weather JS; no cross-links to old constructor; correct relative asset and API paths.
- QR-024 Design tokens, typography, grid/responsive header, mobile sticky CTA, keyboard focus and CTA contrast.
- QR-025 HERO real-photo slot with explicit named placeholder; copy agreed, size selector visible first viewport, positive preview price gate.
- QR-026 Size 5/6 switch: persistent selection, external dimensions 5x2.1/6x2.1, SKU, price 749/799 design-only and proof-mode handling.
- QR-027 Finish selector 3 options, all visible; fallback placeholder photo/color chips, no unverified visual replacements.
- QR-028 Build full specs section from static standard-composition data incl stove/tank/polks/vent/electric etc; mark unconfirmed fields unknown, no editable extra options.
- QR-029 Plans tabs with 5/6 named placeholders and future SVG plan, top view and dimensions; side entrance around middle; no fake internal cm; make source filenames stable.
- QR-030 Media grid/gallery with native lazy loading, real photos only from approved manifest, alt text, no staged-AI substituted as real product.
- QR-031 Delivery/ground section with no foundation inclusion, free consult, clear exclusions and site requirements; no universal «в день доставки».
- QR-032 Trust block verified object photos/reviews, workshop video placeholder, technical details proof; avoid unverified quantities.
- QR-033 FAQ with focus, truthful answers on water, electricity, foundation, delivery, warranty. No fake guarantees.
- QR-034 Closing CTA and legal/footer with placeholders for phone + operator check; no inert buttons, privacy/consent files independent.
DoD T4: standalone, no imports/links old UX, WCAG basic, mobile 320+, placeholder integrity, full copy review.

## Этап T5 — forms, SEO and tracking (P0)
- QR-035 Build short READY lead form: selected SKU/finish, region, phone, name, channel, optional site/notes, consent checkbox; callback alternative. No extra product options.
- QR-036 Client local state: preserve selection on back/open/retry; stable requestId; phone input, field errors; responsive dialog no keyboard trap.
- QR-037 Integrate same-origin /api/leads/quadro-ready; correct persisted success vs MAX state and error; no false thank-you.
- QR-038 UTM/referrer landing attribution with allowlist + size caps; never include PII in analytics; ensure stable source fixed by server.
- QR-039 SEO: noindex-preview; live sitemap/canonical/hreflang only if needed; real meta title/description/OG image; Product schema only with approved Offer price.
- QR-040 Phone CTA and legal: disabled/placeholder until verified number, then tel:+7...; privacy/consent with legal/operator review, no redirect to dead link.
- QR-041 Tests 2x3 selector combos, submit/duplicate/network errors, keyboard navigation, event tracking, malformed params, legal placeholder checks.
DoD T5: form saved on test DB with reference leadId, no data leak/no fake success.

## Этап T6 — combined E2E / hardening (P0)
- QR-042 Contract/invariant scan over old HTML/JS/backend; same old quote engine and content SHA where unchanged.
- QR-043 End-to-end test 2 sites -> one temporary SQLite -> one mocked MAX -> one manager view; separate source and history.
- QR-044 Attack/negative tests spoofed source, origin mismatch, SQL injection attempts, XSS, unknown sku, price tampering, CSRF, rate limiting.
- QR-045 Visual snapshots 320/375/390/430/768/1280/1440, dark/light contrast under design choice, no overflow/CLS.
- QR-046 Load/performance budget 4G-mobile LCP target <=2.5 s (lab proxy, measure), nonblocking JS, no web font shifts, compressed hero.
- QR-047 Test data hygiene: no live phone or secrets in repo, no real MAX use, staged mock only; accessibility keyboard and screen reader labels.
DoD T6: acceptance report links, exact repo SHA, complete PASS or explicit blockers.

## Этап T7 — staging deployment (owner-gated)
- QR-048 Produce two independent, checksum-bound bundles (READY static and relay/manager); manifest, rollback path; preserve data volumes.
- QR-049 Before deploy: execute read-only PowerShell SSH preflight, current/previous, backup SQLite WAL-consistent, Caddy exact route, max credentials presence without revealing secrets.
- QR-050 Stage backend additive migration with verified compatibility and health, old leads form and manager still PASS; no site switchover without owner acceptance.
- QR-051 Stage READY static behind BasicAuth under /quadro-ready-preview/; route only its public lead API, not manager API; old /bani-preview/ exact functional.
- QR-052 Real test lead with approved test number and explicit MAX test permission; verify manager tab and same chat; clean test leads only via audited procedure if approved.
- QR-053 Rollback drill: switch static/backend references, keep DB and forward schema, verify existing site and retained leads. No mutation other projects.
DoD T7: owner sees working secured preview and traceable test lead in common cabinet.

## Этап T8 — public launch and optimization (owner GO only)
- QR-054 Product approval gates: exact stove/wood/doors/vent/sliv/electric/window/ready options and two real prices/costs; approved photos and plans.
- QR-055 Pricing/legal gate: no unverified crossed-out 829/879 prices, verify actual comparison evidence and date; approve customer price, package exclusions and operator privacy/consent.
- QR-056 DNS+HTTPS/Caddy for дачапар.рф/kvadro path, canonical domain/redirect, allowlist update; manager private origin unchanged; source attribution site ID correct.
- QR-057 Production E2E and old-site regression, accessibility/performance, backup, telemetry alerts, rollback: only after owner explicit GO.
- QR-058 Campaign & CRM observability: source/campaign lead quality, site stats, contacts qualified, quote, won/lost, CAC and margin. Don't claim conversions until measured.
DoD T8: live site indexed and marketing enabled only with signed owner acceptance, accurate prices and legal info, no impact to site A.

## Blocker & decision register (owner can close later; does NOT block SPEC)
D01 phone number and callback availability.
D02 actual production cost/ceiling/margin for QR-5/QR-6; willingness to sell at 749k/799k.
D03 lawful and substantiated comparison 829k/879k if discount is desired; else simple fixed prices without strike-through.
D04 stove model, heating volume/certifications, layout/clearance; chimney and metal tank; water and drain conditions.
D05 material/treatment/color chips, roofing color options and whether coloring is same price.
D06 useful interior room dimensions 5/6, actual location/size/direction of side door, furniture sizes, safe pathways.
D07 verified external photos source licensing and correct model matching; plans top/section.
D08 electric scheme included, acceptance and supplier responsibility boundaries for site's hookup; exact foundation consultation wording.
D09 delivery rates, geography, crane/unloading limitations, standard installation scope, warranty, timing.
D10 confirmed operator corporate details and separate PD consent.
D11 where the preview/new domain will live and whether staging BasicAuth reuse is safe.
D12 SQLite server inventory and migration/backup method after read-only preflight.

## Suggested PR / integration order
01 [T0 Docs], 02 [T1 migration], 03 [T1 API], 04 [T2 MAX], 05 [T3 manager UI], 06 [T4 base static/hero], 07 [T4 price/size/finish], 08 [T4 gallery/plans/FAQ], 09 [T5 form/API], 10 [T5 SEO/legal/analytics], 11 [T6 acceptance], 12 [T7 staging], 13 [T8 live GO]. Smaller PRs allowed.
Every PR starts from verified current integration SHA and must not blindly depend on a stale main. Keep Draft until owner QA.
