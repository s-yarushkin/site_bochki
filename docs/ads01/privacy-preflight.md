# ADS-01 · Privacy preflight — awaiting owner/legal GO
Status: **BLOCKED FOR PRODUCTION ENABLEMENT**. This is an engineering checklist, not legal advice or legal approval.

Current `privacy.html` section 8.2 says legal/privacy updates and consent mechanisms are required **before** enabling analytics or advertising tracking. `consent.html` is an application/contact response consent; it does NOT cover Webvisor/advertising tracking by implication.

## What we built
- Default `ADS01_COUNTER_ID = null`, `ADS01_PRIVACY_APPROVED = false`: no Yandex script, cookies, external analytics calls or consent banner initiated by ADS01.
- When both owner-controlled switches are set, public pages show separate opt-in Allow / No analytics controls, save decision locally and start one counter only on Allow. A footer settings button allows changing the choice; declining after prior acceptance forces reload. On denial, local attribution is deleted.
- `ym-disable-keys` on contact input, free comments, honeypot and dynamic builder location; `ym-hide-content` on contact dialog, quote summary and response block. Recording all fields must also be disabled in the owner counter settings.
- Browser analytics `reachGoal` send only approved categorical values. No phone/name/city/address/notes/customer ID/leadId/requestId/raw URLs/yclid as goal parameters.
- No analytics code in manager/admin area or relay API.
- Attribution saved only with opt-in, localStorage rolling 30-day limit, no server DB schema changes.

## Owner + personal-data owner must approve before production
1. Which personal data / tracking identifiers are processed, legitimate legal basis and retention, whether consent required, what constitutes consent/revocation and evidence.
2. Correct public privacy/cookie notice, purposes, recipients, Yandex contractual terms, infrastructure localization and server logging.
3. Whether opt-in UI and localStorage handling satisfy the legal position. Operator details, RKN notices and transfers must be evaluated by responsible counsel.
4. Explicit production configuration GO; do **not** change consent.html SHA/submission evidence for this task.
5. Verify Yandex Metrica Webvisor UI: `Записывать все поля` OFF, `Вебвизор` enabled only after approval; verify with safe fictitious local inputs and private-contents masking before accepting production.

Reference: https://yandex.ru/support/metrica/ru/webvisor/settings
