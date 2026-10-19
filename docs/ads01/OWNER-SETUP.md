# ADS-01 · Owner setup: fast safe path to a Yandex Direct campaign
**Release candidate only — NOT DEPLOYED.** Owner-owned Metrica `113675581` is prepared for direct page-load activation, without any banner or analytics controls, per owner's revised UX instruction. Webvisor OFF. The operator must confirm a valid lawful basis and policy before this candidate goes live. No advertising, production deployment or live MAX operations were performed. Operator must complete privacy/legal checklist before public activation.

## 1. Before making changes
- Accept V7.4 integrated release inventory, verify source SHA and #69 pricing binding, full quote/SQLite/MAX and rollback.
- Owner / legal adviser approves `privacy-preflight.md` and actual updated notice/consent model. This file does not grant legal permission.
- Choose a Yandex account and create or identify the **one owner-owned counter for дачапар.рф** (do NOT merge with separate QUADRO READY counter without express approval).
- Owner confirmed real counter `113675581`, three individually screenshot-verified primary goals; owner reports all 18 JS event goals created. Do not share login/password/token in GitHub.

## 2. Configure the counter
Settings > Counter: real site domain and canonical aliases; enable clickmap and link tracking after lawful-basis review; keep Webvisor, scroll map and form recording OFF for this launch. On Webvisor tab **disable recording all fields**; check `ym-disable-keys` and `ym-hide-content` masking. Ensure the manager area is not tracked.

Create JavaScript-event goals **with exact IDs**:
Primary experimental: `dp_premium_quote_confirmed` — a real server-saved, MAX-delivered quote >=750000 RUB and delivery city Noginsk / Korolyov / Ivanteyevka.
Alternative: `dp_detailed_quote_confirmed`.
Control: `dp_lead_confirmed`.
Secondary diagnostics: `dp_quote_lead_confirmed`, `dp_callback_lead_confirmed`, `dp_phone_click`, `dp_form_open`, `dp_form_close`, `dp_form_error`, `dp_builder_start`, `dp_builder_complete`, `dp_builder_interaction`, `dp_model_view`, `dp_model_select`, `dp_size_select`, `dp_base_kit_open`, `dp_gallery_open`, `dp_cta_click`.
You may postpone optional UX goals in Metrica if count/management burden requires; that does not change source events.

## 3. Explicitly enable later (not in R9 Draft PR)
`assets/js/analytics-config.js` contains `ADS01_COUNTER_ID=113675581`, `ADS01_OWNER_RELEASE_GO=true` and `ADS01_WEBVISOR_ENABLED=false` in an **unpublished** release candidate. There is no analytics pop-up, extra button, or footer control. **Technical GO is not legal approval**: publish only after the operator confirms its specific lawful basis and the policy under applicable requirements. Verify one tag per page and zero extra consent UI; preserve backup, smoke, rollback and immutable SHA evidence.

## 4. Diagnostics without real customers
Use isolated Playwright / Chromium with a **mock** `window.ym` or intercepted tag script; simulated API 200 with persisted/analytics flags; simulate 400/429/502/timeout, duplicate and double-click. No real MAX or production SQLite. Inspect Yandex `reachGoal` request parameters: no PII and no IDs. Real-account goal receipts/Webvisor activity remain NOT_VERIFIED until a strictly authorized non-personal-data test.

## 5. Yandex Direct handoff
- Link owner counter to Direct account once actual access is provided.
- Campaign/control A: click optimization / reasonable traffic and KPI limits to gather baseline data.
- Campaign experiment B: conversion optimization on **one** goal `dp_premium_quote_confirmed`. Keep `dp_lead_confirmed` as diagnostic, **not an additional simultaneously billable conversion goal**.
- High CPA bids do not guarantee high impressions. Estimate unit economics, minimum weekly budget and goal volume. Current Yandex documentation warns when fewer than ~10 weekly conversions are achieved; for a rare goal it can delay learning.
- Do not enable ads or set budget without separate owner signoff. Evaluate conversion volume + query quality, then test alternate `dp_detailed_quote_confirmed` or basic confirmed lead, not unverified clicks.
- In ads, geo targeting and onsite city field are independent: user can browse outside target cities; qualification relies on the user-supplied city, not Yandex IP geolocation.

Official: https://yandex.ru/support/metrica/ru/objects/reachgoal ; https://yandex.ru/support/direct/ru/strategies/average-cpa ; https://yandex.ru/support/direct/ru/strategies/average-cpa-conversions
