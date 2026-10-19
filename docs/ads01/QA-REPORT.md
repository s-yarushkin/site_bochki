# ADS-01 · QA and release truth table
As-of 2026-10-19, after offline CI acceptance. Owner GO for isolated development given, **not** for production. Branch `feat/ads01-r9-conversion-measurement-20261019`, base `release/v74-content-20261019` at 2c3e5a435caed1ca092e9ce957b65a0286302b25.

| Gate | Status | Evidence / gap |
|---|---|---|
| City + price qualification rules | PASS — Node CI | `server/ads01-conversion.mjs`, `tests/ads01-conversion.test.mjs`: 750000 boundary, 3 exact cities, rejection of wrong location/unpriced |
| Server-saved + delivered receipt / duplicate | PASS — isolated unit/mock; live NOT_VERIFIED | `garant-bani-relay.mjs` returns server-owned persisted/qualification flags only for real stored record; browser suppresses duplicate and repeat in session |
| CTA + builder + forms | PASS for tested paths — baseline + extended mock Chromium | `assets/js/app.js` and `analytics.js`; model/size, builder stages, callback, tel, gallery, base |
| All public SEO routes | PASS — mocked Chromium | 8 generated SEO pages (plus home = 9) each include one adapter; generator source updated |
| Personal-data masking | SOURCE VERIFIED; real Webvisor NOT_VERIFIED | Mask contact forms, dynamic region, and responses; no real external counter configured |
| No-fabricated-counter/safe no-op | SOURCE VERIFIED | `analytics-config.js`: null ID and false privacy approval |
| Opt-in UTM/yclid / first-last | PASS in mock Chromium for first/last and opt-out; real Yandex session NOT_VERIFIED | `analytics.js`, server allowlist, no raw URLs passed; live Yandex session attribution unverified |
| 400/429/502/timeout and duplicate browser acceptance | PASS mocked Chromium: 200, duplicate, 400/429/502, aborted network | Chromium synthetic HTTP 200 / duplicate / 502, no production MAX, real 400 / 429 / timeout require extended QA |
| `npm run check`, legacy V73, V74 20 SKU | PASS | GitHub Actions run 39260655369, Node suite + price snapshot; note release base still has COLUMN=H metadata, while owner-approved #69 requires J225:J244 |
| Desktop/mobile 320/390/768/1366/1920 SUN/RAIN | PASS (matrix smoke) | Isolated Chromium width 320/390/768/1366/1920, SUN/RAIN; deeper viewport conversion acceptance remains for V74 RC |
| Real counter configured and goals arriving | COUNTER KNOWN / live goals NOT_VERIFIED | Owner counter 113675581 stored with activation=false. First 3 goals confirmed on owner screenshots, 15 further goals reported created by owner; delivery into actual Metрика not verified. |
| Legal/cookie notice signed | NO-GO | Responsible operator/privacy approval missing |
| Production lead creation | NOT_PERFORMED | No production API post or DB write attempted |
| Production deploy | NOT_PERFORMED | No deployment authorized |
| Ads spend | 0 (actions not initiated) | No Direct changes performed |

## Explicit known limitations
1. SQLite can persist a lead but MAX fail, returning HTTP 502: **never** send primary browser goal on 502. SQLite/Metika divergence must be reviewed; reliable outbox/retry and offline attribution are separate reviewed work.
2. Browser may block or lose `reachGoal`; `duplicate:true` is suppressed to avoid double CPA. SQLite is business truth.
3. Browser-supplied `journeyComplete` and UTM are user-controlled inputs and must not be treated as tamper-proof proof of offline purchase.
4. No live traffic or production acceptance was used. The expanded suite covers selected interactive desktop/mobile/SEO CTAs, full 7-step funnel, browser failure cases and consent. It is **not** an exhaustive proof of all production CTA placements or live Yandex receipt.

**GO/NO-GO**: Implementation draft = reviewable. Live Metrica = NO-GO. Paid traffic = NO-GO. Production deployment = NO-GO until owner, legal and test gates.

## Green CI evidence
- PASS: [ADS-01 R9 GitHub Actions run 39262916542](https://github.com/s-yarushkin/site_bochki/actions/runs/39262916542), including extended Chromium + isolated SQLite/MAX end-to-end tests (HEAD at this run: `625cdd7774a8dde8176e5a9069bb6ded2b4b01fb`).
- `npm run check`: PASS, including new ADS-01 unit tests.
- `node scripts/verify-v74-public-prices.mjs`: PASS on R9 base (H metadata); separate **combined J integration** run `39263168207`: PASS 20/20, `COLUMN=J`, `EXTRAS_UNCHANGED=1` without altering published prices.
- SEO generator parity: PASS (9 indexable URLs including home).
- `ADS01_CHROMIUM=PASS; SEO_ROUTES=9; WIDTHS=5; THEMES=2; MOCK_LEADS=3; PRODUCTION_POSTS=0; REAL_YANDEX_CALLS=0`.
- `ADS01_EXTENDED_BROWSER=PASS; REAL_CTA_DESKTOP_MOBILE=PASS; 8_SEO_PHONE_GOALS=PASS; 3_HTTP_ERROR_PATHS_PLUS_ABORT=PASS; 7_STEP_JOURNEY=PASS; UTM_FIRST_LAST=PASS; DENIAL_REVOCATION=PASS; REAL_MAX=0; PRODUCTION_POSTS=0; REAL_YANDEX_REQUESTS=0`.
- Real phone, contacts, website traffic, production lead persistence, Webvisor goal receipt and Direct reporting were not exercised.

## Release dependency
- [PR #69](https://github.com/s-yarushkin/site_bochki/pull/69) is still Draft/open against the V7.4 release branch as of this report. It corrects the source-of-truth metadata from H to owner-approved J225:J244. R9 changes none of the 20 prices. Before a production merge, R8 must integrate #69, audit price snapshot with J and rerun full regression at immutable release SHA.

## Final isolated combined acceptance, 19.10.2026
- Source R9 head before this documentation update: `625cdd7774a8dde8176e5a9069bb6ded2b4b01fb`.
- Combined integration test branch: `test/ads01-r9-v74-price-j-integration-20261019`; combined immutable SHA `b2c6ffdf5d3f7204daf38e4c2f20b1922c898954`.
- [Combined R9 + unmerged price-source J Actions run 39263168207](https://github.com/s-yarushkin/site_bochki/actions/runs/39263168207) completed SUCCESS; Node, 20 approved prices, generated SEO, Chromium base and extended passed.
- Scope of isolated server tests: price/city premium qualification, forged client price rejection, SQLite duplicate, MAX failure then successful retry, quote vs callback, malformed requests, sanitized attribution.
- Scope of expanded Chromium: mobile and desktop phone/CTA, 8 SEO phone clicks, seven-step quote with source city and size, 400/429/502 and aborted request, first/last-touch campaign identifiers, opt-in and revocation.
- **This does not merge #69/#71**. Release merge order: land/approve #69, refresh PR #71 onto final V7.4 and rerun gates before any deploy.
- Final activation status: **NO-GO** pending legal/privacy signoff, owner merge/deploy GO and verified real Metrica goals. Real counter ID `113675581` is configured **disabled**; first 3 goal IDs screen-verified, others user-reported created. Ad launch and payment explicitly excluded.

## Owner Yandex Metrica setup, 19.10.2026
- Confirmed `дачапар.рф` counter: `113675581`, configured in source with `ADS01_PRIVACY_APPROVED=false` (external tag OFF).
- Three screenshot-confirmed goal IDs: premium `672514007`, detailed `672514096`, all leads `672514144`; exact event identifiers match the R9 contract.
- Owner confirmed all 18 goals entered manually; remaining 15 not independently screenshot-verified. Static revenue should be blank; only one primary billable goal per Direct campaign.
- Before activation: confirm automatic goals OFF, ecommerce OFF, content analytics OFF, Tag Manager OFF, Webvisor/form recording OFF pending privacy review; screenshot/owner proof needed.
