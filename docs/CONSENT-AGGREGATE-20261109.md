# Consent and aggregate actions release

This additive release preserves the live Nov 7 entrance counters, Today/Yesterday controls, staff exclusion, lead contracts, MAX delivery and mandatory MFA. It introduces daily action totals without visitor IDs, session IDs, IP fields, click IDs, campaign IDs, exact timestamps, arbitrary URLs or customer text. The API rejects unexpected fields. Technical network/security logging remains a separate concern.

Detailed visitor history and Yandex Metrika remain opt-in. Existing choices are respected. The compact lower-left banner has two accessible choices, a close action that grants no permission, an independent consent document and footer settings. Withdrawal stops Metrika (including pending initialization) and clears the site's tracking state without reloading a customer form.

The manager Actions tab adds aggregate counts separately from consent-based reports. Banner acceptance is accepted / (accepted + declined); impressions are not unique people. Product/source filters do not affect global banner metrics. Past events cannot be reconstructed. Staff browsers remain excluded.

## Research behind the design

- [Utz et al., 2019](https://arxiv.org/abs/1909.02638): large field experiment; position, choices and presentation influence interaction. Its European audience does not establish Russian legal requirements or a guaranteed uplift.
- [Nouwens et al., 2020](https://arxiv.org/abs/2001.02479): hiding rejection raises acceptance; this design keeps rejection visible and accessible.
- [Didomi metric definition](https://support.didomi.io/consent-rate-per-cmp-format-1): consent rate among choices differs from consent coverage across all visitors.
- [Didomi 2026 benchmark](https://www.didomi.io/blog/best-consent-banner-format-europe-2026): observational format comparisons; no causal promise for this website.
- [Agency case study](https://eminence.ch/en/portfolio-item/onetrust-consent-optimization-mcdonalds/): concise contextual copy is a testable hypothesis, not a transferable performance guarantee.
- [Yandex official destruct method](https://www.yandex.ru/support/metrica/ru/code/counter-spa-setup) supports withdrawal without a forced reload.

## Verification and publication

55 automated checks cover isolated HTTP submission, stubbed notification delivery, receipt deduplication, old lead contracts, consent gates, aggregate privacy, permissions and MFA. No test sends a real MAX message. Browser automation was unavailable during this run; visual QA is not claimed.

1. `prepare-consent-release.py` verifies the entire actual release against the reviewed baseline and builds a deterministic 16-file overlay. The actual home page is retained; only the approved winter Parus share-preview metadata changes.
2. `check-consent-package.py` uploads and tests complete candidate imports, JavaScript syntax and an isolated aggregate database without sudo or live changes.
3. `publish-consent-terminal.py` rechecks the baseline, then requests the sudo password privately. No password or production database is downloaded or saved locally.
4. `deploy-consent-remote.py` takes a consistent server-only SQLite backup and tests restoration before creating two aggregate tables. It switches web/API release symlinks and enables `92-aggregate.conf`.
5. Health, authentication, lead rejection, rejection of private aggregate fields, public checksums and the existing short-link preview are checked. Failure restores old symlinks and the previous drop-in; it never overwrites new leads with a stale database.

Receipts are in `.local/consent-release/` (ignored), with root-only backups and rollback pointers under `/var/backups/dachapar/CONSENT-…/`. No claim of publication is valid without a successful receipt and independent health/config verification.
