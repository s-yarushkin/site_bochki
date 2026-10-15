# Дача Пар — commercial launch continuation

Owner GO received 2026-10-15, 18:27 Moscow. This authorizes continuation; it is not evidence of successful delivery, approved numeric prices, or completed legal procedures.

Current installed source remains `56bf8a1a82d2b11bdfd8408e557f59c884c2a5dc`; HTTPS and live 7-viewport browser QA were confirmed by owner-run output. No site redeployment is needed for the following diagnostic.

## Safe working MAX delivery test

Run `ops/v72-live-max-smoke.ps1 -SourceSha <EXACT_COMMIT_CONTAINING_SCRIPT>` through the owner's PowerShell/SSH. It checks the transferred script hash and invokes it with sudo to read existing systemd credentials. No credentials are printed, copied into GitHub, rotated or changed.

The script confirms the expected active runtime, running process working directory and relay module SHA256, then reads the running relay's environment. It imports that release's actual validator, SQLite store, HTTP handler and MAX delivery function. It starts a temporary loopback HTTP listener and uses only SQLite `:memory:`; the production database is never opened by the diagnostic.

One callback with consent edition 2026-10-14 is submitted to the isolated listener. Its formatted notification is replaced at the outgoing transport boundary with a clearly labeled technical diagnostic containing no name or phone number; `notify=false`. The MAX origin and message endpoint stay fixed. After successful MAX API acceptance, an identical request checks idempotency without sending another message. The script exits and discards the in-memory SQLite store.

Success means: actual active credentials and MAX destination accepted one diagnostic through the delivery adapter, isolated HTTP/store status succeeded and duplicate suppression succeeded. It does not mean a human manager read the message, nor that a real customer lead was written into production SQLite. A failure can occur after the server accepted the message; do not rerun blindly.

Local checks: complete Node suite 143/143 PASS; no actual MAX message sent by local tests.

## Content facts still required

The current pricebook explicitly retains `CATALOG_DRAFT`; amounts remain preliminary and must not be silently promoted or changed. Public legal pages still describe themselves as a draft for operator approval and leave actual retention/processing arrangements to confirmation. Owner GO must not be converted into invented facts about retention, processors or completed notifications. These content facts require the operator's actual information before removing draft statements. No claim of legal compliance is made here.

Indexing remains blocked in HTML, Caddy response headers and robots.txt; changing only one layer would not enable crawling. A subsequent scoped release must handle these together, add canonical and sitemap, keep manager/API paths out of indexing and preserve the old site. Paid advertising has no supplied campaign or budget and is not launched.
