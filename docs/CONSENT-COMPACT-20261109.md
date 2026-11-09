# Compact consent update

The compact notification has one primary “Хорошо” button, no dismiss cross, and a settings link with a refusal option. No tracking permission is inferred from browsing or silence. The copy describes statistics and advertising measurement; it does not claim identifiable analytics is anonymous. Processor details remain in the linked, separate analytics consent and privacy policy.

No fields, checkboxes, rows or steps are added to application forms. The existing notice paragraph is reused: “Нажимая кнопку отправки, вы даёте согласие на обработку данных и аналитику сайта и рекламы”, with separate links to the existing processing consent and the analytics consent. Only forms containing this visible notice qualify; opening a form or entering a phone number grants nothing. Quiz launch buttons receive the requested brief notice before a user starts the quiz; the quiz itself is preserved byte for byte.

Consent is requested only after the associated explicit action. The server records time and an allowlisted document/method version in the existing consent record. Previous “Без аналитики” choices are preserved on both client and server. A user can change that choice explicitly in settings. Existing processing-consent documents and lead evidence hashes are unchanged; their scope is not silently expanded. No names, phones, form text or complete lead payloads are added to Yandex goal events.

The lead sender waits at most 1.4 seconds for an already initiated consent request, without blocking lead submission on tracking failure. Goals occurring during this explicit request are sent only after successful permission, and confirmed-lead goals still require a persisted, delivered receipt and remain deduplicated. Older events from before the permission action are not replayed. Metrica may still be unavailable because of blockers or network errors; delivery of every conversion is not guaranteed.

Aggregate counters now also include quiz invitation views/closures, completion and closures before/after completion, with or without analytics permission. They retain daily sums, not visitor histories. Staff exclusions, Today/Yesterday, lead/MAX contracts and MFA are preserved.

64 automated checks passed, including HTTP consent evidence, preservation of refusal, ordered choice changes, consent failure, goal timing and duplicate receipts, plus the existing API, CRM and MFA checks. Browser automation was unavailable earlier in this session; no completed visual QA is claimed. Deployment must verify the complete current inventory, test candidate imports and isolated counters, back up SQLite and validate restoration, and retain automatic symlink rollback.

Legal design reference: [152-FZ Article 9](https://www.consultant.ru/document/Cons_doc_LAW_61801/6c94959bc017ac80140621762d2ac59f6006b08c/) permits a confirmable consent form while requiring informed, specific and unambiguous consent, separately documented. This implementation does not treat a generic historical processing consent as permission for unrestricted disclosure.

## Published

Published as `CONSENT-099fe32abfa5` on November 9, 2026, source commit `b47cd51b8fc0ad534990d090e0c432dc59549b23`. Thirteen files were overlaid; the actual quiz, model imagery, layouts and application fields were retained. The runtime notice reuses the existing form paragraph.

The successful server receipt confirms health, enabled counters, required manager authentication, rejection of invalid leads/private counter fields, public module checksums and the preserved share preview. Credentials and MFA modules remain protected by the complete inventory guard. No test production lead or real MAX message was sent. Backup integrity and isolated restore passed; server-only backup: `/var/backups/dachapar/CRM-AUDIT-20261109T104725Z`. Rollback pointers: `/var/backups/dachapar/CONSENT-099fe32abfa5/state.json`.
