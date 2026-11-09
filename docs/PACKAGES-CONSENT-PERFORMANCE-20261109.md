# Packages, preference persistence and loading

## Customer-facing changes

The banner retains its existing structure with advertising words removed. Existing consent choices, withdrawal, absence-of-consent gates and lead processing remain unchanged. Preference storage uses the explicit `/api/privacy/choice` route, with the historical analytics-consent route retained for old tabs. This stores the user's choice, not a proxy for blocked Yandex tracking requests.

Preference requests have a separate 30/minute/IP budget; analytics retains its existing 40/minute/IP budget. A regression test fills the analytics budget and then saves consent through both routes. Before separation, the old consent route was rejected with 429 in this scenario. This is a demonstrated failure mode, not proof of the exact HTTP failure in the customer's Chrome session. The client tolerates an eight-second request, retries one transient network/server failure and never treats a failed analytics event listener as a failed saved choice. It does not invent a successful save or retry permanent rejection in a loop.

The main package section now has two balanced cards with an emotional introduction and concrete included equipment. `content/packages-20261109.json` is the single editable copy source. The builder creates the public JS constants and static HTML from it. Comfort includes its existing stove, furniture, glass steam-room door, PVC entrance/window, light and ventilation; Deluxe explains its two-heater stove, jadeite, shelves, lighting, insulation and larger openings. Corpus treatment follows the owner's instruction; additional floor treatment remains a Deluxe distinction. No claim is made that all interior surfaces or every color upgrade are included free of charge.

The comparison shows 18 concrete rows in four groups, current selected-model prices from the existing calculation, and highlighted Deluxe improvements. It keeps semantic table headings, a clear close action and focus return. On mobile each feature has two readable comparison cells; header/prices remain visible while the table scrolls. No extra sales CTA or inquiry step was introduced. The folding table is correctly described as one table replacing the standard table.

## Loading evidence and changes

Measurements on November 9, 2026 are HTTP timings, not browser LCP/INP measurements:

| Measurement | Observed |
| --- | --- |
| Server-side public-page/module/config TTFB | roughly 0.05–0.16 s |
| This PC's public-page/module/config TTFB | roughly 0.49–0.75 s |
| This PC's DNS | roughly 0.08–0.12 s |
| Main hero WebP | 98 KB at 640 px; 309 KB at 1280 px; 524 KB at 1920 px |
| Main HTML blocking stylesheet requests | 14 before; 9 after |

Six adjacent critical stylesheets are combined in the original cascade order. Relative CSS URLs are rebased; fonts, sizes and themes are retained. The generated bundle is content-hashed and the responsive hero is preloaded using the exact same srcset/sizes as its HTML image. No pricebook, image or 3D geometry is modified.

The origin sends `Cache-Control: no-store` even for hero images and fonts. Thus returning loads cannot benefit from normal HTTP caching. That policy was measured and documented, but not broadly changed: safe longer caching requires a versioning/invalidating policy for the site's assets; prices and private APIs must remain fresh. The two roughly 231 KB pricebooks are not interchangeable: Deluxe values differ. They were deliberately retained. Both 3D loaders already use dynamic imports when opened, so Three.js was not falsely identified as an initial-load cause.

The screenshot's `ERR_BLOCKED_BY_CLIENT` concerns the browser's blocked Yandex request; it does not by itself identify the preference-storage error or prove the website server is slow. Official references: [Yandex debugger](https://www.yandex.ru/support/metrica/ru/general/debugger), [Chrome LCP guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/performance/performance), [web.dev LCP](https://web.dev/articles/optimize-lcp).

## Verification and deployment

69 automated checks pass, covering preference failure/retry/quotas, consent gates, API submission with stubbed delivery, deduplication, CRM permissions, MFA, package content and the CSS build. A local fixture is provided at `/package-review.html` with `CRM_PREVIEW_PACKAGE_REVIEW=1`. The in-app browser timed out; completed visual QA in Chrome/mobile is not claimed.

The deployment is a narrow overlay against the complete hash-verified active release. Main HTML changes are the package section and loading hints/styles; model navigation, layouts, images and actual prices are retained. The publisher checks the candidate first, takes a consistent server-only database backup and validates restoration, then switches web/API pointers with automatic rollback on failed health, privacy-route, lead-validation or public-file checks. No production test lead or real MAX message is sent.
