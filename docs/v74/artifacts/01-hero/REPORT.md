# V74-01 / #58 — R1+R2 handoff

ISSUE=58
ROLE=R1+R2
BASE_BRANCH=plan/v74-customer-experience-20261019
BASE_SHA=d93967b5dfa49ea135ed33722ad735545e9cbbd5
HEAD_BRANCH=feat/v74-01-hero-fold-qa-20261019
HEAD_SHA=REFER_TO_PR_HEAD_AT_QA_TIME
PRODUCTION_WRITES=0
LEADS=0 (test design; run pending)
OWNER_REVIEW_NEEDED=YES

## Изменения

- `assets/css/v74-hero.css`: desktop hero layout, height-aware spacing and typography. No photo/copy/product/API/price changes.
- `index.html`: last stylesheet link, so all prior sun/rain/mobile styles remain authoritative except scoped desktop override.
- `tests/browser_v74_first_viewport.py`: before/after Chromium screenshot matrix, real DOM rects, click hit tests, keyboard anchor, assets, weather switch, horizontal overflow, lead POST interception.
- `sections-map.md`, `design-decision.md`, `baseline.md`: section strategy, alternatives, baseline evidence.

## Mandatory browser acceptance (must be executed, not inferred)

| Check | Command | Status until actual run |
|---|---|---|
| Baseline desktop sun/rain + screenshots | `python tests/browser_v74_first_viewport.py --phase before --root <base> --out-dir <out>` | NOT_RUN |
| Head desktop 1366/1440/1536/1920 sun/rain | `python tests/browser_v74_first_viewport.py --phase after --root . --out-dir <out>` | NOT_RUN |
| Node V73 regression | `npm run check` | NOT_RUN |
| Mobile regression | `python tests/browser_mobile_acceptance.py` | NOT_RUN |
| Real browser zoom 90/110/200% & manual visual review | Chromium desktop browser / QA evidence | NOT_RUN |

`before-<size>-<theme>.png` / `after-<size>-<theme>.png`, companion JSON, and CSV must be attached via QA artifact (workflow runner or manual).
No blanket PASS if workflow cannot run. 90/110/200% actual browser zoom is not equivalent to page CSS zoom or simulated narrow viewport.

ROOT_CAUSE=Multi-file CSS vertical budget plus breakpoint reflow (hypothesis; confirm from before/after computed rects)
BEFORE_RECTS=NOT_RUN
AFTER_RECTS=NOT_RUN
DESKTOP_QA=NOT_RUN
MOBILE_QA=NOT_RUN
NODE_QA=NOT_RUN
PRODUCTION_WRITES=0
PR_URL=ASSIGN_WHEN_CREATED
ROLLBACK=Revert this feature PR / remove final stylesheet import.

## Other-owner work explicitly excluded

V74-02 pricebook, V74-03 base-price UX, V74-04 global copy, V74-06 configurator, all media and server components remain unchanged. R0 must approve screenshots and real device zoom before merge.
