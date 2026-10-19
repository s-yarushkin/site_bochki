# ADS-01 · Privacy preflight — awaiting owner/legal GO
Status: **CODE PREPARED / OPERATOR LEGAL SIGNOFF PENDING**. This RC has no analytics banner or opt-in buttons by owner decision; it initializes the counter at page load if published. Operator must confirm an applicable lawful basis; a policy notice or browsing alone cannot be treated as evidence of consent.

The isolated RC updates `privacy.html` §8.2–8.5 to disclose Yandex Metrica and separate opt-in. The operator must still approve the actual legal basis/retention/consent and confirm updated policy before publishing. `consent.html` is an application/contact response consent; it does NOT cover Webvisor/advertising tracking by implication.

## What we built
- RC config: real `ADS01_COUNTER_ID = 113675581`, technical `ADS01_OWNER_RELEASE_GO = true`, `ADS01_WEBVISOR_ENABLED = false`; when published it would initialize once per page on load. There are NO new visitor consent controls. Legal approval remains independent of this technical switch.
- Per owner UX decision, the release adds no visitor-facing analytics buttons or dialogs. The public privacy policy §8 describes processing; the controller must independently document legal grounds, information duties and rights handling before publishing.
- `ym-disable-keys` on contact input, free comments, honeypot and dynamic builder location; `ym-hide-content` on contact dialog, quote summary and response block. Recording all fields must also be disabled in the owner counter settings.
- Browser analytics `reachGoal` send only approved categorical values. No phone/name/city/address/notes/customer ID/leadId/requestId/raw URLs/yclid as goal parameters.
- No analytics code in manager/admin area or relay API.
- First/last touch attribution is stored locally for up to 30 days if the counter is enabled. This is not consent evidence; legal review must account for cookies and identifiers. No server schema changes.

## Owner + personal-data owner must approve before production
1. Which personal data / tracking identifiers are processed, legitimate legal basis and retention, whether consent required, what constitutes consent/revocation and evidence.
2. Correct public privacy/cookie notice, purposes, recipients, Yandex contractual terms, infrastructure localization and server logging.
3. Whether loading Yandex Metrica without an affirmative click is permissible on a specifically documented legal basis; operator details, RKN notices, retention, cookie identifiers, storage and transfers must be evaluated by responsible counsel.
4. Explicit production configuration GO; do **not** change consent.html SHA/submission evidence for this task.
5. Verify Yandex Metrica Webvisor UI: `Записывать все поля` OFF, `Вебвизор` enabled only after approval; verify with safe fictitious local inputs and private-contents masking before accepting production.

Reference: https://yandex.ru/support/metrica/ru/webvisor/settings
