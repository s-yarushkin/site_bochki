# ADS-01 · QA and release truth table
As-of 2026-10-19, after offline CI acceptance. Owner GO for isolated development given, **not** for production. Branch `feat/ads01-r9-conversion-measurement-20261019`, base `release/v74-content-20261019` at 2c3e5a435caed1ca092e9ce957b65a0286302b25.

| Gate | Status | Evidence / gap |
|---|---|---|
| City + price qualification rules | PASS — Node CI | `server/ads01-conversion.mjs`, `tests/ads01-conversion.test.mjs`: 750000 boundary, 3 exact cities, rejection of wrong location/unpriced |
| Server-saved + delivered receipt / duplicate | PASS — isolated unit/mock; live NOT_VERIFIED | `garant-bani-relay.mjs` returns server-owned persisted/qualification flags only for real stored record; browser suppresses duplicate and repeat in session |
| CTA + builder + forms | PARTIAL — CTA/source contract and selected Chromium path; exhaustive interaction matrix pending | `assets/js/app.js` and `analytics.js`; model/size, builder stages, callback, tel, gallery, base |
| All public SEO routes | PASS — mocked Chromium | 8 generated SEO pages (plus home = 9) each include one adapter; generator source updated |
| Personal-data masking | SOURCE VERIFIED; real Webvisor NOT_VERIFIED | Mask contact forms, dynamic region, and responses; no real external counter configured |
| No-fabricated-counter/safe no-op | SOURCE VERIFIED | `analytics-config.js`: null ID and false privacy approval |
| Opt-in UTM/yclid / first-last | IMPLEMENTED; full first/last + live Yandex session NOT_VERIFIED | `analytics.js`, server allowlist, no raw URLs passed; live Yandex session attribution unverified |
| 400/429/502/timeout and duplicate browser acceptance | PARTIAL (200/duplicate/502 mocked PASS) | Chromium synthetic HTTP 200 / duplicate / 502, no production MAX, real 400 / 429 / timeout require extended QA |
| `npm run check`, legacy V73, V74 20 SKU | PASS | GitHub Actions run 39260655369, Node suite + price snapshot; note release base still has COLUMN=H metadata, while owner-approved #69 requires J225:J244 |
| Desktop/mobile 320/390/768/1366/1920 SUN/RAIN | PASS (matrix smoke) | Isolated Chromium width 320/390/768/1366/1920, SUN/RAIN; deeper viewport conversion acceptance remains for V74 RC |
| Real counter configured and goals arriving | NOT_VERIFIED | Owner ID/access missing |
| Legal/cookie notice signed | NO-GO | Responsible operator/privacy approval missing |
| Production lead creation | NOT_PERFORMED | No production API post or DB write attempted |
| Production deploy | NOT_PERFORMED | No deployment authorized |
| Ads spend | 0 (actions not initiated) | No Direct changes performed |

## Explicit known limitations
1. SQLite can persist a lead but MAX fail, returning HTTP 502: **never** send primary browser goal on 502. SQLite/Metika divergence must be reviewed; reliable outbox/retry and offline attribution are separate reviewed work.
2. Browser may block or lose `reachGoal`; `duplicate:true` is suppressed to avoid double CPA. SQLite is business truth.
3. Browser-supplied `journeyComplete` and UTM are user-controlled inputs and must not be treated as tamper-proof proof of offline purchase.
4. No live traffic or production acceptance was used. Current tests cover limited mock cases; 400/429/timeout and all CTA placements need additional Chromium acceptance before release GO.

**GO/NO-GO**: Implementation draft = reviewable. Live Metrica = NO-GO. Paid traffic = NO-GO. Production deployment = NO-GO until owner, legal and test gates.

## Green CI evidence
- PASS: [ADS-01 R9 GitHub Actions run 39260655369](https://github.com/s-yarushkin/site_bochki/actions/runs/39260655369) on commit `406b6db2169d476cb2a45c32b2081a79dd148a32`.
- `npm run check`: PASS, including new ADS-01 unit tests.
- `node scripts/verify-v74-public-prices.mjs`: PASS against current release-base snapshot; **not** proof that owner source J in #69 is merged.
- SEO generator parity: PASS (9 indexable URLs including home).
- `ADS01_CHROMIUM=PASS; SEO_ROUTES=9; WIDTHS=5; THEMES=2; MOCK_LEADS=3; PRODUCTION_POSTS=0; REAL_YANDEX_CALLS=0`.
- Real phone, contacts, website traffic, production lead persistence, Webvisor goal receipt and Direct reporting were not exercised.

## Release dependency
- [PR #69](https://github.com/s-yarushkin/site_bochki/pull/69) is still Draft/open against the V7.4 release branch as of this report. It corrects the source-of-truth metadata from H to owner-approved J225:J244. R9 changes none of the 20 prices. Before a production merge, R8 must integrate #69, audit price snapshot with J and rerun full regression at immutable release SHA.

## Unified V7.4 + ADS-01 Metrica opt-in RC
- Created from prior combined source `b2c6ffdf5d3f7204daf38e4c2f20b1922c898954` (column J price source and full R9 analytics, CI PASS at run `39263168207`).
- Owner confirmed one counter `113675581` and manual creation of 18 exact JS goals; independent account verification is incomplete for goals 4–18.
- RC uses technical `ADS01_OWNER_RELEASE_GO=true` with visitor opt-in, Yandex script loaded only after acceptance, Webvisor disabled, link to expanded privacy §8; zero script before consent is CI gate.
- No automatic production deploy path exists in the repo. Remote Desktop Commander device `DESKTOP-VJMGOO6` was OFFLINE on 2026-10-19; operator access via authorized PowerShell/SSH is necessary for release.
- **Live release NO-GO** until operator approves privacy notice/consent basis; production read-only preflight; backup + restore rehearsal; deployment under pinned SHA; HTTPS/synthetic-no-lead smoke and live Metrica verification. Never state campaign spend or real goal receipts as PASS without evidence.
