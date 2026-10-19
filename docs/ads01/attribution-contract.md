# ADS-01 · Attribution contract v1
Opt-in model for a future owner-owned Yandex Metrica counter; current default OFF.

## Capture
At user acceptance of analytics consent: parse only `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `yclid`, allowlisted landing pathname and referrer category. UTM max 90 chars, yclid max 180; only alphanumeric (Latin/Cyrillic), dot, underscore, colon, plus, hyphen; no slash, @, arbitrary free-text, URL or query value. Referrer -> `yandex`, `google`, `external`; pathname -> `/a-z0-9/-` only. Unsafe / overlong values dropped, not logged.

## Persistence
Only after explicit opt-in; browser localStorage key `dp_attribution_v1`: first touch and last touch, rolling age max 30 days. Last touch updated when campaign identifiers are supplied. Browser sessionStorage `dp_counted_leads_v1` stores up to 60 requestIds **locally** only for best-effort dedupe; no requestId enters Yandex. Denial/revocation clears attribution and reloads to prevent further collection. Consent key independent of `consent.html` (submit processing).

## API/SQLite
`attributionForLead()` appends sanitized `{first,last}` only when user consent is accepted and owner switch configured. Server repeats allowlist checks, persists accepted touch context in lead snapshot JSON, not logs, not MAX notifications and not `reachGoal` params. Existing SQLite schema is unchanged; no production migration. Source metadata is browser-provided and therefore indicative, not fraud-proof.

## Landing and query controls
Before initializing external Yandex code, the adapter retains consented campaign context and strips unnecessary query strings from history, retaining only known safe `model`, `contact`, `from` route keys and fragment. This limits accidental leak through default pageview metadata. Generated SEO navigation can move to the main configurator; first-touch survives within approved storage. `yclid` is retained internally only with consent; Yandex attribution may vary with blockers and redirects, so real-account verification is required.

## Reports
Segment by source/medium/campaign/landing/model/flow, later device/geo via approved Metrica reports. CPL requires actual Direct spend. Do not equate quote totals with realized revenue, or count manager status `won` without CRM verification.

## RC mode change — no visitor analytics UI
Owner rejected any extra pop-up/buttons, and RC no longer waits for localStorage consent flag. When operator authorizes production activation, the counter automatically collects available allowed campaign metadata on page load. Previous opt-in-only section above describes the superseded prototype and is **not** the operating mode of this RC. Processing still requires a documented lawful basis; browsing the website alone does not prove consent.
