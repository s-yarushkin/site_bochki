# ADS-01 · Event contract, version 1
Event IDs below are exact names of Yandex Metrica JavaScript-event goals created in the **real owner-owned counter** after GO. Never fabricate counter IDs or submit-click success.

| Event | Trigger (one per action) | Allowed params | Use |
|---|---|---|---|
| `dp_lead_confirmed` | HTTP 200, receipt ok=true delivered=true, server analytics.persisted=true, duplicate!=true and requestId not previously counted in session | flow | main all-lead goal / control |
| `dp_premium_quote_confirmed` | Above AND server premiumQualified=true: quote.total >=750000, exact allowed city | flow=quote | PRIMARY experimental Direct goal |
| `dp_detailed_quote_confirmed` | Above AND detailedQualified=true (real journey completion, two priced extras, delivery district provided) | flow=quote | alternative |
| `dp_quote_lead_confirmed` | Above, flow=quote | flow | diagnostic |
| `dp_callback_lead_confirmed` | Above, flow=callback | flow | diagnostic |
| `dp_phone_click` | actual click href=tel: on site/SEO pages | placement | microconversion; NOT a completed call |
| `dp_form_open` | dialog.showModal() | flow | funnel |
| `dp_form_close` | modal close without successful submit | flow | funnel/drop-off |
| `dp_form_error` | visible validation/API error | flow | funnel |
| `dp_builder_start` | first true interaction with builder, not merely view/scroll | placement | funnel |
| `dp_builder_complete` | progress from step 6 to summary step 7 through navigation | placement, model | funnel |
| `dp_builder_interaction` | paid/other option changes inside builder | step, placement | UX |
| `dp_model_view` | model card >=50% viewport, once per model per page view | placement, model | funnel |
| `dp_model_select` | catalog selection or interactive builder model change | placement, model | funnel |
| `dp_size_select` | interactive size click | size, model, placement | funnel |
| `dp_base_kit_open` | base-kit dialog trigger | placement, model | UX |
| `dp_gallery_open` | gallery trigger | placement, model | UX |
| `dp_cta_click` | configured CTA (hero, builder, callback, bundle, model, SEO) | placement | UX |

## Server classification (mandatory)
`server/ads01-conversion.mjs` owns city matching and price threshold. Accepted case-insensitive strings: `Ногинск`, `Королёв` / `Королев`, `Ивантеевка`; optionally `г.` or `город`, and `Московская область` / `Московская обл.` comma-separated. All other text including two cities, a wider district or unrecognized address fails closed. The quote total is recomputed with server-controlled pricebook version. Amount null, quoteRequired=true or unpriced items fail.

The server emits only booleans to the browser: `{persisted:true,premiumQualified:boolean,detailedQualified:boolean}`. Client never calculates expensive-goal qualification and never sends raw PII to Yandex. Stored `requestId` and `leadId` NEVER enter external event params.

## Goal semantics and idempotency
The server SQLite has UNIQUE request_id. Browser suppresses `duplicate:true`, double-click submits and session-counted requestIds. Browser suppression is best-effort, not an accounting ledger; external reliable exactly-once conversions would require separate server upload/attribution architecture and owner approval. A 502, 429, 400, timeout, 409, or 503 never produces `dp_lead_confirmed`.
Premium, quote, all-lead can all be emitted for one confirmed request for reporting. **Billable strategy must choose ONE goal**. No synthetic click or report download is a premium lead.

## Data minimization
Only the parameter names `placement`, `flow`, `model`, `size`, `step` with strict enums/regex are allowed to `reachGoal`. No price as e-commerce revenue, no userParams, no name/phone/comment/city/address/requestId/free text/raw URI/referrer/yclid in goals. Phone click only records the placement.
