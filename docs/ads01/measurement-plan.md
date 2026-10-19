# ADS-01 · Measurement plan for Yandex Direct launch
Scope: https://дачапар.рф, issue #70. Baseline: release/v74-content-20261019 (2c3e5a4), tracked in isolated feat/ads01-r9-conversion-measurement-20261019. No production deploy, ads, counter activation, pricing or real leads.

## Business intent
Primary controlled experiment: a **persisted and MAX-delivered quote** with server-side estimated total >= 750,000 RUB AND location exactly Noginsk, Korolyov or Ivanteyevka (optional prefix "г." / "город" and Moscow oblast). The city is user-provided at the quote form / configurator; this is **not** inferred from IP, device geolocation or UTM. A high conversion bid does not guarantee inventory or low CPM. Maintain a separate click-optimized campaign/control and audit CPL against actual SQLite entries.

## Journey and measurement
1. SEO or main landing (source/campaign/referrer/device/landing), navigation, scroll/session quality.
2. Hero -> models: hero CTA, model card view via IntersectionObserver >=50%, gallery, base-kit, bundle.
3. Configurator: first interaction, model and size selection, seven-step completion. Merely opening the builder is not completion; bundle summary can skip steps.
4. Form: open callback vs quote, validation/API error, modal close without success.
5. Submit -> validate server quote and district -> SQLite create unique requestId -> MAX delivery -> HTTP 200 delivered; only then reachGoal for persisted confirmed lead. Duplicate:true never produces another browser goal.
6. Source attribution: gated first and last touch for up to 30 days; only allowlisted fields, stripped URL metadata.

## Pages and CTA inventory (source-level)
- `/`: header `tel:`, header callback; hero builder / models; catalog filters, model images, base-kit and select; Comfort bundle summary/customize; individual/delivery callbacks; seven-step builder, quote details and quote CTA; FAQ callback; final CTA builder/callback; footer tel/callback; mobile sticky tel/callback; mailto.
- `/bani/` and four `/bani/{kvadro,parus,viking,kvadro-haus}/`: model pages, phone, manager link, builder/model deep links.
- `/dostavka-i-ustanovka/`, `/voprosy/`, `/kontakty/`: phone, manager callback, builder, internal links.
- All public site pages share one adapter; manager/admin/API routes have **no** public analytics integration.
- Check navigation, SUN/RAIN, 320/390/768/1366/1920 px; click events are not proof of completed calls.
- 9 canonical indexable routes include home plus eight generated SEO pages.

## Event schema
The exact goals, triggers and parameters are in [event-contract.md](event-contract.md). Only an opted-in, confirmed counter dispatches goals. `placement` is from a fixed enumeration, never text from a button or arbitrary URL. `model` and `size` are approved IDs, not names, prices, customer attributes or free text.

## High-priority risks
- On MAX failure, the record may remain in SQLite while API returns 502: do not claim success or dispatch primary reachGoal on 502. This causes a documented undercount of persisted but unnotified leads; any shift to persisted-first success + retry worker needs isolated compatibility acceptance.
- Post-click browser blocking / closed tab can undercount Yandex reachGoal; SQLite is independent business truth; server offline conversion upload is future owner-approved work.
- Two goals can fire on one lead (all + premium + quote). Set **only one billable conversion goal per campaign**; use the others for diagnosis.
- City field accepts a location/district; only server strict recognized city strings qualify premium. No substring guesses.
- Any `null` quote amount (unpriced add-ons), unapproved quote or non-quote callback cannot qualify premium.
- No real Yandex counter, no privacy/legal GO, no current browser acceptance = analytics and ad spend NO-GO.

## Release gates
`npm run check`, ADS-01 Node contracts, 20-SKU current + V73 historical price regressions, regenerated 8 SEO pages, desktop/mobile scenarios, no exfiltration of PII, requests to real MAX = 0, production SQLite writes = 0, ad spend = 0. Evidence and gaps in [QA-REPORT.md](QA-REPORT.md).
