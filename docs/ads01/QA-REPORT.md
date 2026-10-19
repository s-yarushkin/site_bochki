# ADS-01 · QA and release truth table
As-of 2026-10-19. Owner GO for isolated development given, **not** for production. Branch `feat/ads01-r9-conversion-measurement-20261019`, base `release/v74-content-20261019` at 2c3e5a435caed1ca092e9ce957b65a0286302b25.

| Gate | Status | Evidence / gap |
|---|---|---|
| City + price qualification rules | IMPLEMENTED / CI PENDING | `server/ads01-conversion.mjs`, `tests/ads01-conversion.test.mjs`: 750000 boundary, 3 exact cities, rejection of wrong location/unpriced |
| Server-saved + delivered receipt / duplicate | IMPLEMENTED / CI PENDING | `garant-bani-relay.mjs` returns server-owned persisted/qualification flags only for real stored record; browser suppresses duplicate and repeat in session |
| CTA + builder + forms | IMPLEMENTED / BROWSER NOT_VERIFIED | `assets/js/app.js` and `analytics.js`; model/size, builder stages, callback, tel, gallery, base |
| All public SEO routes | IMPLEMENTED / BROWSER NOT_VERIFIED | 8 generated SEO pages (plus home = 9) each include one adapter; generator source updated |
| Personal-data masking | SOURCE VERIFIED / BROWSER NOT_VERIFIED | Mask contact forms, dynamic region, and responses; no real external counter configured |
| No-fabricated-counter/safe no-op | SOURCE VERIFIED | `analytics-config.js`: null ID and false privacy approval |
| Opt-in UTM/yclid / first-last | IMPLEMENTED / BROWSER NOT_VERIFIED | `analytics.js`, server allowlist, no raw URLs passed; live Yandex session attribution unverified |
| 400/429/502/timeout and duplicate browser acceptance | NOT_RUN | Requires isolated Chromium receiver and fake MAX |
| `npm run check`, legacy V73, V74 20 SKU | NOT_RUN | Must be executed on branch SHA in clean Node environment |
| Desktop/mobile 320/390/768/1366/1920 SUN/RAIN | NOT_RUN | Requires browser screenshots and mock network |
| Real counter configured and goals arriving | NOT_VERIFIED | Owner ID/access missing |
| Legal/cookie notice signed | NO-GO | Responsible operator/privacy approval missing |
| Production lead creation | NOT_PERFORMED | No production API post or DB write attempted |
| Production deploy | NOT_PERFORMED | No deployment authorized |
| Ads spend | 0 (actions not initiated) | No Direct changes performed |

## Explicit known limitations
1. SQLite can persist a lead but MAX fail, returning HTTP 502: **never** send primary browser goal on 502. SQLite/Metika divergence must be reviewed; reliable outbox/retry and offline attribution are separate reviewed work.
2. Browser may block or lose `reachGoal`; `duplicate:true` is suppressed to avoid double CPA. SQLite is business truth.
3. Browser-supplied `journeyComplete` and UTM are user-controlled inputs and must not be treated as tamper-proof proof of offline purchase.
4. No live traffic or production acceptance was used; once CI/browser tests run, append exact pass/fail logs, commit SHA and evidence links, never infer PASS.

**GO/NO-GO**: Implementation draft = reviewable. Live Metrica = NO-GO. Paid traffic = NO-GO. Production deployment = NO-GO until owner, legal and test gates.
