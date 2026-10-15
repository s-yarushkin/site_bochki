# Дача Пар — V7.2 release candidate, 15.10.2026

Status: **OWNER ACTION REQUIRED — not deployed**.

Parent accepted SHA: `3ae94319b3a287e30b052e466fb42541c3f18e30`, PR #45.
Use the exact commit containing this document; never deploy a floating branch.

## Verified in this run

- GitHub PR head matched the accepted SHA before editing.
- `npm run check`: 141/141 Node tests, syntax checks PASS.
- `python tests/v72-installer.test.py`: 5/5 isolated installer safety tests PASS.
- Domain browser navigation returned 502 with upstream TLS internal error. A valid HTTPS page was **not** observed.
- Direct SSH from this execution environment: network unreachable.
- Authorized remote Windows device was listed online, but infrastructure reads did not return usable output; the file-read request ultimately failed `Timeout - no response from device`.
- No remote deployment, Caddy validation, production SQLite inspection, or real MAX delivery is claimed.
- Prior accepted frontend QA (7 viewports) remains evidence for the unchanged UI. New live QA is pending. Local Chromium download failed; no new browser PASS is claimed.

## Minimal transition architecture

One existing relay process and one existing SQLite database. Preserve the old frontend link and the entire old Caddyfile byte prefix. Publish the new frontend through a separate `/srv/sites/dachapar-preview/current` link.

The original `ALLOWED_ORIGIN` and `SITE_BASE_PATH` remain unchanged. Add a dedicated systemd drop-in containing:

```ini
[Service]
Environment='ADDITIONAL_SITES_JSON=[{"origin":"https://xn--80aaan1dh9b.xn--p1ai","basePath":"/"}]'
```

The backend resolves the exact preserved HTTP Host against explicitly configured origins; it never selects cookie scope from Origin or X-Forwarded-Host. Each manager API uses its corresponding exact Origin and cookie path. Cookie remains host-only, Secure, HttpOnly, SameSite=Strict. Unrecognized hosts and cross-domain modifying requests fail closed. Both consent editions remain accepted. Storage schema, pricebook, model/media assets, MAX credentials and existing manager credentials are unchanged.

## Installer

`ops/v72-domain-release.ps1 -SourceSha <EXACT_COMMIT>`:

1. Clones and checks out the exact commit; requires Node 24, Git, tar, SSH, SCP.
2. Runs the full Node checks locally. Builds a Git archive plus per-file SHA256 manifest, transfers it over SSH and verifies the package hash before extraction.
3. Runs `ops/v72-domain-install.py` with sudo. Root access is needed only on the server; if sudo prompts, the owner enters the password in the SSH terminal.
4. Fails closed unless the expected Caddy checksum, V7.1 static link, V6.6 backend link, unit command, environment path, origin, base path, port, health and unauthenticated 401 match. A changed baseline requires fresh review; never bypass its guard.
5. Makes a root-only backup of Caddy, unit text, env and SQLite using SQLite's backup API with integrity checks. Does not stop, reset, migrate or replace the live database.
6. Stages static/runtime releases, validates the complete appended Caddy candidate, adds only the new relay environment drop-in, activates compatible backend before exposing new frontend, validates health/401, then reloads Caddy.
7. Verifies HTTPS with the system trust store and checks legal pages, core assets, health, manager 401, noindex and preservation of the old link/config prefix.
8. Runs live seven-viewport browser QA from Windows using `py -3` and installed Playwright. All lead-form requests are intercepted in-browser and mocked; no production test lead is created. The existing test also covers themes, four galleries, calculation, CTA topic and mobile overflow.

The Windows live browser test requires `py -3` with Playwright installed and a compatible Chromium or installed Chrome/Edge. If missing, the installer reports live QA pending rather than declaring release ready. There is no unattended sudo bypass and no credential provision/rotation. PowerShell launcher syntax and Caddy candidate have not been validated by their native runtimes in this run; server preflight must validate Caddy before activation.

## Rollback

The server prints an exact rollback command using its root-only backup path:

```sh
sudo python3 /var/backups/dachapar/20261015-<SHA12>-v72/installer.py --rollback /var/backups/dachapar/20261015-<SHA12>-v72/state.json
```

Rollback restores the old relay link and original Caddy bytes, ownership and permissions, removes only this release's new drop-in and frontend link, restarts only the relay and reloads Caddy. Release directories remain available. It **never restores the SQLite backup over the live database**, so post-release customer leads survive. Unexpected concurrent Caddy/link/drop-in changes stop rollback instead of overwriting another engineer's work.

Automatic rollback covers activation/HTTP verification failures. A later browser-QA failure leaves the noindex preview installed and reports failure for investigation; the printed rollback command remains available.

## Launch boundaries

No permanent redirect, old site deletion, commercial GO, SEO indexing or paid traffic. Real working MAX delivery remains NOT TESTED. An isolated mock demonstrates the request/storage path, not delivery to the working MAX group. The installer does not claim to finish browser acceptance until the final live browser script succeeds.
