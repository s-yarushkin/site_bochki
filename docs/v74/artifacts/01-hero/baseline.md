# V74-01 · Baseline browser evidence and confirmed root cause

BASE_SHA=`d93967b5dfa49ea135ed33722ad735545e9cbbd5`
TESTED_SOURCE_SHA=`48c10fb2f97b2ba2ea498fc0b88770aeedca0991`
RUN_URL=https://github.com/s-yarushkin/site_bochki/actions/runs/39226183783
SCREENSHOT_ARCHIVE=https://github.com/s-yarushkin/site_bochki/actions/runs/39226183783/artifacts/12173468682
DATE=2026-10-19
LEADS=0

## Evidence from real Chromium, baseline branch checkout

| Viewport | before sun proof bottom | before rain proof bottom | Accept before? |
|---|---:|---:|---|
| 1366×768 | 775.23px | 818.25px | FAIL / FAIL |
| 1440×900 | 790.14px | 836.16px | PASS / PASS |
| 1536×864 | 805.05px | 856.03px | PASS / FAIL (0.03px over 8px safety margin) |
| 1920×1080 | 805.66px | 856.84px | PASS / PASS |

The baseline main CTA was already within 1366×768 in this run (sun bottom=684.23px, rain=727.25px) but all three proof steps were not. This distinction matters: the owner's symptom depends on the actual browser's usable CSS viewport and theme. The strict G1 acceptance still failed before.

Measured at baseline 1366×768: header 79px; weather toolbar bottom=170px; H1 `68.3px`; H1 bottom sun 454.02px, rain 524.69px; lead bottom sun 590.64px, rain 633.66px; hero proof bottom sun 775.23px, rain 818.25px.

**Confirmed contributing mechanism:** normal-flow weather toolbar, oversize H1 (up to 77px in `v5-finish.css`), lead/CTA/proof spacing across four CSS layers, width-triggered 850px grid switch, and absence of a hero-specific low-height viewport budget. The rain copy adds enough height to push already borderline proof further down.

### Measured smaller-window paradox

With viewport height held at 900px:
- 851px width (desktop grid): `proof.bottom=794px`, `photo.bottom=642.22px`.
- 768px width (single column): `proof.bottom=675.33px`, `photo.bottom=1246.33px`.

A narrower window appears to show **more hero text/CTA** because the two-column layout collapses and the text gains width. However, the photo moves off screen; this is a reflow artifact, not a gain in useful viewport space.

### After at 1366×768

`proof.bottom=548.64px`, `photo.bottom=577.95px` in sun and rain. Both CTA clickable; assets loaded, real `hero-sun.webp` unchanged, no horizontal overflow, 0 lead POSTs.

**Archive:** paired PNG screenshots, JSON computed styles/rects, CSV before/after at https://github.com/s-yarushkin/site_bochki/actions/runs/39226183783/artifacts/12173468682. Full outcomes in [REPORT.md](REPORT.md).
