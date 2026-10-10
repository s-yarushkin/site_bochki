# Garant Bani V5 — Tilda CDN reachable from approved VPS

**Date:** 2026-10-10. **Status:** VPS HTTPS PROBE PASS; PHOTO DOWNLOAD STILL PENDING.

## Owner-run PowerShell SSH probe, actual evidence

```text
CHECK=STATIC_TILDA_CDN
HTTP=206 IP=95.181.182.182 TIME=0.134982
STATUS=REACHABLE
CHECK=TILDA_WEBSITE
HTTP=200 IP=176.57.67.226 TIME=0.145890
STATUS=REACHABLE
VPS_PROBE_COMPLETE=YES
PRODUCTION_UNCHANGED=PASS
```

The probe was executed with the existing authorized deployment SSH account on 135.106.137.195, did not use sudo, did not write to the site, Caddy, databases or manager accounts. A **range GET** success on one Tilda asset is not confirmation of full retrieval of all 36 candidate images.

## Next bounded safe action

- Transport the already prepared local `review.json` manifest (36 page-exclusive candidate URLs) from Windows to a fresh, mode-700 directory under the SSH user's HOME.
- Use VPS HTTPS curl, without credential headers or redirects, with fixed source hostname `static.tildacdn.com`, per-file byte/time caps and byte-signature validation. Save images only in a private directory under HOME, create offline `index.html`, updated `review.json` and ZIP.
- Download ZIP via SCP to Windows and attach it for actual model/scene/photo review. The CDN is accessible from VPS; the Windows CDN route was confirmed to time out.
- **Nothing is approved for publication** until actual imagery is seen and photo rights/model identity are confirmed. Do not use a photo showing a different model or invented SUN/RAIN pairing. Avoid any production deploy in this step.

## Latest gates

- V5 theme PR #9: functional browser QA PASS, not production released.
- Tilda inventory PR #10: 36 review candidates, 80/80 pre-recovery tests passed, photo import still blocked until the offline ZIP is obtained.
- VPS CDN probe: PASS; **full image download is NOT YET DONE**.
