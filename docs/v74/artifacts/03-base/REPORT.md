# V74-03 · Цена → содержание базы → конкретная модель

ISSUE=60
ROLE=R1+R2+R4
BASE_SHA=d93967b5dfa49ea135ed33722ad735545e9cbbd5
PRODUCTION_WRITES=0
SCOPE=Catalog and model-specific base kit UI, without changing site or server price values.

## Implementation
- Each of the four model cards has a distinct accessible `Что входит в стоимость` button next to the already-present public source price.
- Native modal `<dialog>` reads `PRICEBOOK.baseInclusions` (common 6 core points, model-specific entrance/structure and 3 separately-paid categories) from the same versioned product source. It uses model price `Math.min(Object.values(model.sizes))` and never hard-codes a second price.
- `Полный состав` leads to the pre-existing 19-item fact list; all statements remain visible in their original section.
- `Выбрать «Модель»` moves to selected model and valid first size of builder. Focus return on Escape and focus on builder after choose; weather themes and approved gallery photos preserved.
- No new assets, API, SQLite, MAX, tariff code or production changes.

## Handoff and checkpoints
- `npm run check`, `tests/browser_v74_base_kit.py` and `tests/browser_mobile_acceptance.py`.
- 4 models, 5 viewports, sun/rain, photo gallery unaffected, button keyboard/escape, model-specific statement and canonical amount, no horizontal overflow, `LEADS=0`.
- Price display after V74-02 merge will update automatically via the unchanged `PRICEBOOK` import. This branch itself leaves V73 values intact to avoid mixing P0 scopes.
- CI screenshots and report URL to append after run.
- Owner review still required; no deploy.
