# V74-01 / #58 — R1+R2 browser-verified handoff

ISSUE=58
ROLE=R1+R2
PR=https://github.com/s-yarushkin/site_bochki/pull/66
BASE_BRANCH=plan/v74-customer-experience-20261019
BASE_SHA=d93967b5dfa49ea135ed33722ad735545e9cbbd5
TESTED_SOURCE_SHA=48c10fb2f97b2ba2ea498fc0b88770aeedca0991
HEAD_BRANCH=feat/v74-01-hero-fold-qa-20261019
HEAD_SHA=CHECK_CURRENT_PR_HEAD (documentation-only commits may follow tested SHA)
RUN_ID=39226183783
RUN_URL=https://github.com/s-yarushkin/site_bochki/actions/runs/39226183783
SCREENSHOT_ARCHIVE=https://github.com/s-yarushkin/site_bochki/actions/runs/39226183783/artifacts/12173468682
PRODUCTION_WRITES=0
LEADS=0
OWNER_REVIEW_NEEDED=YES

## Changes in scope

- `assets/css/v74-hero.css`: desktop vertical budget and h1/proof/image composition; does not affect <=850px.
- `index.html`: import last-scoped stylesheet. No markup, price, photo, media slot, link or API change.
- `tests/browser_v74_first_viewport.py`: real Chromium rects/styles, 2 links hit-target, keyboard activation, photo load, sun/rain, screenshot JSON/CSV.
- `.github/workflows/v74-hero-qa.yml`: checkout base/head separately, run before/after, npm check, mobile acceptance and upload artifact.
- Documentation: `baseline.md`, `design-decision.md`, `sections-map.md`.

## Real Chromium QA at 100% — verified 19.10.2026

Runner: GitHub-hosted Ubuntu / Chromium via Playwright; exact versions preserved in run log. Zoom=100%, deviceScaleFactor=1; screenshot viewport only; local HTTP server, NO production requests/POST.
For each required desktop size: BOTH themes, H1/lead, 2 CTA, all 3 proof steps and #heroMedia have `rect.bottom <= innerHeight-8`; button hit-target and anchor destination; loaded real asset; zero horizontal overflow.

| Width×height | Before proof bottom sun / rain | After proof bottom sun / rain | Before G1 | After G1 |
|---|---|---|---|---|
| 1366×768 | 775.23 / 818.25 | 548.64 / 548.64 | FAIL / FAIL | PASS / PASS |
| 1440×900 | 790.14 / 836.16 | 577.31 / 577.31 | PASS / PASS | PASS / PASS |
| 1536×864 | 805.05 / 856.03 | 577.53 / 577.53 | PASS / FAIL (0.03 px) | PASS / PASS |
| 1920×1080 | 805.66 / 856.84 | 593.06 / 593.06 | PASS / PASS | PASS / PASS |

At 1366×768 after: H1 bottom 362.45px, lead 433.48px, primary CTA 493.48px, secondary 480.50px, proof 548.64px, photo 577.95px; all within viewport with room. Photo source `hero-sun.webp` and photoLoaded=true in both themes; approved slot remains untouched.

## Root cause (source + measured DOM)

1. Independent normal-flow toolbar sits above the grid. Before, toolbar bottom=170px on 1366; after compact toolbar bottom≈142px.
2. Before, `v5-finish.css` gave H1 `68.3px` at 1366 and `76.8px` at 1536, without a height-aware hero mode. On 1366 rain H1 bottom=524.69px vs sun=454.02px; longer rain text requires an extra line. After H1 `51.225px` at 1366, both themes H1 bottom=362.45px.
3. `site.css`, `themes-v5.css`, `v5-finish.css` and `weather-v6.css` collectively reserve toolbar/hero/copy/lead/action/proof spacing while the 5:4 image determines grid height. The existing max-height rules mostly condensed #models rather than hero, so proof slipped below fold.
4. **Smaller-window paradox measured:** at equal 900px height, 851px-wide baseline proof bottom=794px but 768px-wide proof bottom=675px. At 850px breakpoint CSS switches from two columns to one: text column expands, so proof moves up **while photo moves below fold** (photo bottom 1246px at 768). This is not more total content fitted, only text ordering/reflow. Corrected desktop two-column variant no longer relies on this.

## Tests actually run (GitHub Actions run 39226183783)

- `python head/tests/browser_v74_first_viewport.py --phase before --root base --out-dir evidence`: PASS as **evidence collection**; includes failing baseline G1 cases, not falsely reported as baseline pass.
- `python head/tests/browser_v74_first_viewport.py --phase after --root head --out-dir evidence`: **PASS**, 8/8 required desktop sun/rain.
- `npm run check` inside candidate: **PASS**, 182/182 tests, 0 failed.
- `python tests/browser_mobile_acceptance.py` inside candidate: **PASS**, 8 widths × sun/rain, LEADS=0.
- Screenshots/JSON/CSV: https://github.com/s-yarushkin/site_bochki/actions/runs/39226183783/artifacts/12173468682

## Gaps / conditions for signoff

- Real Chromium browser zoom **90%, 110%, 200%** and large system fonts: **NOT_RUN**. Programmatic narrow viewport/CSS zoom must not be substituted and called an exact browser-zoom PASS. G12 full accessibility remains PENDING.
- Real iOS Safari / Android Chrome on physical devices: NOT_RUN; owner QA requested.
- Owner visual signoff after reviewing sun/rain screenshot pair: PENDING.
- G1 at 100% and G2 responsive anomaly are PASS. Full V74 release is not authorized; no production deploy or PR merge performed.

ROLLBACK=Revert this PR / remove `assets/css/v74-hero.css` import (no server data changes).
HANDOFF_TO=R0 visual owner approval + R2 actual browser zoom accessibility.
