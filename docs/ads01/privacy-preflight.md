# ADS-01 · Privacy / lawful-basis preflight (current RC)

**Status: LEGAL/OPERATOR SIGNOFF PENDING — NOT DEPLOYED.** This document is a technical inventory, not legal advice.

The owner rejected extra analytics popups, banners, and click-to-accept UI. Current RC has none; the callback/quote form still displays its own existing text about processing entered contact data. The live behavior of `privacy.html` §8.2–8.5 describes planned Yandex Metrica 113675581. Publishing policy text **does not itself prove the visitor consented** to optional tracking.

## Data and technical controls
- Counter `113675581`, 18 exact JS goals, `ADS01_OWNER_RELEASE_GO=true` in unpublished RC. If deployed, initialization is automatic on a public page, no user controls added.
- `ADS01_WEBVISOR_ENABLED=false`; verify Webvisor/form-field recording is also OFF in the real Yandex account before enabling.
- `ym-disable-keys` applied to phone, name, delivery district, comment and dynamic region; `ym-hide-content` on contact dialog/quote/result. No personal free text, phone, leadId, requestId, address or userParams in `reachGoal`.
- Allowed event parameters only `placement`, `model`, `size`, `step`, `flow`. The adapter is not injected into manager/admin endpoints.
- UTM/yclid and safe first/last touch are retained locally for up to 30 days, and sanitized again on the server before addition to the lead JSON snapshot. This collection must be included in the operator's legal assessment.
- Existing form handling and its `consent.html` SHA remain independent. Do not add modal dialogs, cookie banners or checkboxes to the sales funnel merely to satisfy implementation convenience.

## Mandatory operator review before public analytics activation
1. Identify and document a specific lawful basis for each category of technical identifiers, visits, goals, UTM/yclid and service data processing. Do not assume browsing = consent. If the actual lawful basis requires an affirmative opt-in, the owner and counsel must agree a compliant alternative before tracking begins.
2. Approve actual privacy notice, operator/processor responsibilities and Yandex contracts, retention, access controls, location/transfer and relevant Roskomnadzor obligations.
3. Approve current processing of personal details in lead form and privacy/consent text against real SQLite + MAX retention and roles.
4. Verify Webvisor recording OFF in owner account; network/browser smoke with anonymized local data; production test goals only after an explicitly approved safe method, without real customer leads.
5. Confirm pinned release SHA, server preflight, backup, restore rehearsal, fail-closed rollback, no other services touched.

## Operational blocker
Remote Desktop Commander `DESKTOP-VJMGOO6` was OFFLINE when checked. The repository includes `ops/ads01-readonly-preflight.ps1` which inventories active WEB/API links and price version through SSH without mutation. Do not run the old limited `ops/v74-content-release.ps1` against the combined ADS-01 RC: its approved overlay omits the new analytics JS, backend conversion classifier and legal page.
