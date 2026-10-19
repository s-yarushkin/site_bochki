# V74 — спецификация визуального конфигуратора
**Статус:** контракт на проектирование, не обещание готовой 3D-системы. Продуктовая цель — пользователь видит, как реальная баня меняется при выборе модели, размера, отделки, кровли и функциональных решений.

## 1. Проблема и целевой путь
V73 ведёт выбор через `stepNames=['Выберите модель','Выберите размер','Внешний вид','Парная и тепло','Удобства','Ваш участок','Ваша комплектация']`, но в некоторых шагах иллюстрация не меняется, а текст остаётся каталоговым. В V74:
1. Клик «Квадро» → точный фотопакет выбранной модели, чертёж/план (если утверждён), описание особенностей конкретной модели.
2. Клик «4 м»/«5 м»/«6 м» → цена выбранного размера и план под выбранную геометрию; фото меняется только если имеется достоверное модельно-размерное изображение. Не растягивать физически фото 4м, выдавая за 6м.
3. Клик цвета корпуса «Северное море/Орех/Красное дерево» и других реальных отделок → цвет в главной зоне меняется только если есть соответствующая утверждённая визуализация того же корпуса и ракурса. Иначе показываем выбранный цвет отдельно на образце и статус «Итоговый оттенок на древесине может отличаться».
4. Клик кровли → аналогичный принцип для утверждённых цветов кровли.
5. Клик опции «Ограждение печи», «Подспинники», «Стеклянная дверь», «Свет», «Форточка», «Вариант топки» → микро-превью реального исполнения/схема и короткая выгода; если визуальное изменение на общем фото достоверно возможно — менять соответствующий слой.
6. Финал → фото того же товара + выбранная планировка + фактически доступные опции + реальная серверная цена + CTA менеджеру; если изображение не охватывает все выборы, явно написано «Изображение показывает модель; выбранные детали указаны в комплектации».

## 2. Source of truth
- `data/pricebook.js`, `assets/js/quote-engine.js`: доступные модели/размеры, валидные ID/стоимости/совместимость и серверный эквивалент (НЕ derive price from image or swatch).
- `data/config-visual-manifest.json` (новый): строго типизированная карта *достоверных* планов/ассетов/вариантов, проверки соответствия.
- `assets/js/configurator/state.js`: controller store, reducer, URL state, version, валидатор.
- `assets/js/configurator/preview.js`: pure resolver `resolveVisual(config,manifest)` with available slots/fallback/provenance; render main/side/plan; cancellation stale load.
- `assets/js/configurator/ui.js`: accessible controls/events, step transitions and `aria-live` summary.
- `assets/js/app.js`: интеграция без второй копии state/quote rules; поэтапная миграция вместо дублирующихся источников.
- `assets/configurator/`: только утверждённые изображения, схемы и превью.
- `assets/js/catalog-gallery-v67.js`, `assets/js/media-v5.js`: текущие альбомы не переписать до приёмки перехода.

## 3. Схема визуального манифеста (предлагаемый интерфейс)
```json
{
  "schemaVersion": "v74.1",
  "approvedAt": null,
  "models": {
    "kvadro": {
      "sizePlans": {
        "400": {"asset": null, "actualDimensionsM": [4, 2.1], "approval": "PENDING_PRODUCTION"},
        "500": {"asset": null, "actualDimensionsM": [5, 2.1], "approval": "PENDING_PRODUCTION"}
      },
      "exterior": [],
      "optionShots": {}
    }
  },
  "shots": [],
  "colors": [],
  "roofColors": [],
  "compatibility": []
}
```
**Пример — только описание схемы, не файл с выдуманной планировкой.** Поля shot: `id`, `kind` (photo | edited-photo | illustrative-render | verified-plan | verified-component), `modelId`, `sizeId`/null, `bodyFinishId`/null, `roofFinishId`/null, `optionIds`, `angle`, `src`, `width`, `height`, `sha256`, `sourceRef`, `approval`, `notes`. План хранит `planRevision`, `dimensions`, `roomAreas` только после подтверждения. Все `src` локальные; никаких скрытых внешних запросов.

## 4. State / transitions
```text
{modelId,sizeId,finishId,roofId,optionIds,bundleId,view,activeVisualId,step,pricebookVersion}
-> SELECT_MODEL: reset invalid size/option/visual and preserve user-approved compatible choices
-> SELECT_SIZE: validate available SKU, recalc quote + plan, remove invalid options with non-silent notice
-> SELECT_BODY_COLOR / SELECT_ROOF_COLOR: map approved variants, maintain invariant no fake recolor
-> TOGGLE_OPTION: validate compatibility and exclusivity, quote update, visual A/B/C selection
-> OPEN_PLAN / OPEN_OPTION_PREVIEW / RETURN_MAIN: view state only, never alters quote
-> NEXT/BACK: preserve valid choices, do not rerun submission
-> SUBMIT: existing client→server lead path with immutable snapshot, exact consent version/CSRF guards
```
One user event = one atomic state transition; DOM is derived from state. Prevent stale async photo load overriding later selection. Browser back handling (if implemented) must not lose selected price/config. No mutable direct `window` globals exposed to URL injection. No hidden runtime configurator source of prices.

## 5. Three-level preview semantics
| Level | Which changes | Rendering contract | Fallback |
|---|---|---|---|
| A — main image | model / verified exterior size, body finish, roof finish, approved major exterior alteration | choose exact shot/layer for valid configuration, animate only on completed load, correct source mapping | latest approved base photo of selected model + swatches + explicit limitation |
| B — secondary detail | sauna door, heater guard, shelves/backrests, soft light, vent/window, stove-firebox, storage | detail gallery item with option name and benefit, original photo or product-specific diagram | thumbnail placeholder «Фото детали готовится», not a different model |
| C — text/tooltip | invisible/small or service features | short user-focused title, benefit, price if individual option; optional label/diagram | clear text, no fabricated 3D state |

### На каком этапе что принимаем
**Q1 (layout)**: visually fixed (not overlaying controls) preview, price/plan/selection readable on each step, matching existing real model photos. **Q2 (dynamic)**: model/size plans and color/roof state change for approved combinations, no hallucinated colors. **Q3 (feature)**: A/B/C mapped for major options with approved photos; incompatible selections disabled with clear reason.

## 6. Фото / планировки / слои
- Size-driven geometry: предпочтительно SVG-план из утверждённых измерений. Не просто `scaleX(6/4)` всей схемы — двери, зоны и пропорции могут различаться.
- Exterior sizes: prepared photography/verified render at fixed camera angle; an adjusted silhouette is allowable only as visual illustration labelled appropriately and approved; avoid promises about door/roof spec.
- Compositing colors: fixed base source and approved body/roof masks; lighting, highlights and textures cannot be recolored crudely. Visual sample outside product photo is fallback.
- Door state: distinguish exterior entrance, partition room→washing, washing→steam, and product option id. DO NOT assume «глухая базовая дверь» before production confirms exact door spec.
- Firebox relocation depends on model geometry. Do not show change or promise compatibility without approval.
- Feature light and wood treatments depend on sun/rain style; avoid image double exposure and synthetic weather artifacts on product.
- Model mapping: `kvadro`, `parus`, `viking`, `kvadro-house`, sizes as actually present in pricebook (five each). `kvadro-house` values `4x4` etc. never parse to first digit.

## 7. Buyer language UI
Bad: `Дополнение по каталогу`, `опция ID`, `модификация SKU`, `позиция #`.
Good: `Как будет выглядеть`, `Выберите цвет`, `Что изменится`, `Добавить удобство`, `Входит в стоимость`, `Ваша баня`, `Посмотреть планировку`.
Use short content-backed benefits, no unverified energy efficiency/heat times/warranty statements. Compact option card with visual first, title, 1-sentence benefit and individual price if applicable. Confirm base inclusions so extras aren't charged twice.

## 8. Interaction and QA invariants
1. Every enabled choice changes at least: active-state indicator + correct money; if applicable, approved preview asset. No «немой выбор».
2. Price equals current `calculateQuote`, server revalidation and pricebookVersion; no front-end totals accepted from query string.
3. Option compatibility and no double counting; selections invalidated with visible notice and no silent loss.
4. Images keyed by model, size, finish, roof, option when applicable; source hash and approval; fallback safe.
5. Plan dimensions match factory approval and displayed size, no imaginary room or door. Plan can be absent with truthful status.
6. UI works 320–1920 desktop/mobile, no sticky overlap or horizontal scroll, zoom to 200%; keyboard focus visible.
7. Light/rain theme changes atmosphere only and cannot change selected object or price. With reduced motion, no animation.
8. Gallery open/close, back, scroll, screen readers, async image error and offline mock have safe states.
9. Screenshot grid: 4 models × each five sizes baseline plan and price; body/roof variations per available coverage; at least 1 material option A, 3 option groups B/C after media approval.
10. Submissions are only with owner-authorized smoke; public QA has `LEADS=0`. Manager receives same model/finish/roof/options as selected.
11. Internal state/version IDs must not leak in customer copy or alt.
12. Performance budgets measured on real media: image lazy-loading for below fold, LCP hero prioritized, image decode managed, no large video dependency.

## 9. Blockers that require real supplier facts
- Approved floor plans for 20 configurations (geometry, windows, zones, entrances) vs currently general size descriptions.
- Door base spec for each model + mapping of glass-door add-on to precise internal partition.
- True roof/body color library for each model and coatings under daylight.
- Stove/mounting/firebox and window add-on compatibility.
- Cohesive room interiors for each exact model; not stitched from other objects.

Unresolved supplier details must remain `PENDING_PRODUCTION` in private checklist or public generalized doc, never guessed to enable an animation.

## 10. Handoff and acceptance
R5 writes interface contract and deterministic `resolveVisual` tests first. R6 receives exact shot list and produce owner-approved packet. R7 integrates hashed files and maps them. R2 polishes usability. R8 runs full tests. Owner gives per-model approval of plan/color/option evidence before V74 GO.
