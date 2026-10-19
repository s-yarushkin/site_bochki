# ADS-01 · Attribution contract (current no-banner RC, 19.10.2026)

## Release scope and legal gate
Counter `113675581` is configured and `ADS01_OWNER_RELEASE_GO=true` in the **unpublished** RC. The public UI has no additional analytics banner, cookies widget, or opt-in button. When this RC is lawfully activated on production, the adapter initializes once on public-page load. **The operator must document the lawful basis and approve the policy/rights process first**. Visiting a website does not, by itself, prove valid consent.

## Collection / allowlist
The browser parses only `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `yclid`, safe landing pathname and categorical referrer. UTM max 90 chars, yclid max 180; only Latin/Cyrillic alphanumeric, underscore, dot, plus, colon and hyphen. No `@`, arbitrary URLs, query-text values, phone numbers or comment text in event parameters. Landing is allowlisted pathname, not full URL; referrer only `yandex`, `google`, `external`.

## Storage and attribution
Browser localStorage `dp_attribution_v1` stores first and last touch (rolling 30-day freshness). Last touch changes if campaign metadata is present, while first touch is retained. Browser sessionStorage `dp_counted_leads_v1` stores at most 60 request IDs locally to suppress duplicate goal events; **no request ID is sent to Yandex**. Browser-provided attribution is indicative, not evidence of actual ad billing or fraud-proof origin.

On form submit, `attributionForLead()` includes sanitized first/last touch only when the counter's release switch is active. The server validates all fields again and stores them in the JSON lead snapshot. No SQLite schema migration, no changes to existing leads, and no attribution values in MAX notifications or `reachGoal` parameters.

## URL protection and Yandex
Before loading external `tag.js?id=113675581`, the adapter removes unknown/unsafe query parameters and retains only safe route keys (`model`, `contact`, `from`) and allowed UTM/yclid parameters so Direct attribution can work. Browser blockers, redirects and real Yandex processing are outside isolated QA and require owner-authorized production verification.

## Reports
Segment visits and validated lead goals by campaign/landing/model/flow/device. Real CPL requires actual Direct spend. Do not treat preliminary quote value as recognized revenue. Webvisor OFF; independent privacy/legal approval is a production release gate.
