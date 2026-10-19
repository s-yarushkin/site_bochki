"""V74-01 R1/R2 browser evidence: local checkout only; never POST production.

Usage:
 python tests/browser_v74_first_viewport.py --phase before --root PATH_TO_BASE --out-dir PATH
 python tests/browser_v74_first_viewport.py --phase after  --root .            --out-dir PATH
Only 'after' enforces first-viewport acceptance. 'before' records real failures.
Requires playwright and a Chromium browser (PLAYWRIGHT_CHROMIUM_EXECUTABLE optional).
"""
import argparse
import csv
import functools
import http.server
import json
import os
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

REQUIRED = [(1366, 768), (1440, 900), (1536, 864), (1920, 1080)]
EXTRA = [(1280, 720)]
MOBILE = [(320, 700), (390, 844), (430, 932), (768, 900), (851, 900)]
TARGETS = {
    "header": ".header",
    "toolbar": ".hero-toolbar",
    "title": "#heroTitle",
    "lead": ".hero-lead",
    "primary_cta": ".hero-actions a:first-child",
    "secondary_cta": ".hero-actions a:last-child",
    "proof": ".hero-proof",
    "photo": "#heroMedia",
    "step_1": ".hero-proof > div:nth-child(1)",
    "step_2": ".hero-proof > div:nth-child(2)",
    "step_3": ".hero-proof > div:nth-child(3)",
}

class LocalOnly(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        self.send_error(405, "Browser screenshot test never accepts leads")

def get_metrics(page):
    return page.evaluate("""targets => {
      const measured = {};
      for (const [name, selector] of Object.entries(targets)) {
        const el = document.querySelector(selector);
        if (!el) { measured[name] = null; continue; }
        const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
        const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
        const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
        const hit = document.elementFromPoint(x, y);
        measured[name] = {
          x: +rect.x.toFixed(2), top: +rect.top.toFixed(2),
          right: +rect.right.toFixed(2), bottom: +rect.bottom.toFixed(2),
          width: +rect.width.toFixed(2), height: +rect.height.toFixed(2),
          display: style.display, visibility: style.visibility, opacity: style.opacity,
          position: style.position, paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom, marginBottom: style.marginBottom,
          fontSize: style.fontSize, lineHeight: style.lineHeight,
          gridTemplateColumns: style.gridTemplateColumns,
          isHitTarget: !!hit && (el === hit || el.contains(hit)),
          withinViewport: rect.width > 0 && rect.height > 0 && rect.top >= 0 &&
                          rect.bottom <= innerHeight - 8 && rect.left >= 0 &&
                          rect.right <= innerWidth + 1 &&
                          style.display !== 'none' && style.visibility !== 'hidden'
        };
      }
      const img = document.querySelector('#heroMedia .v5-photo');
      return {
        innerWidth, innerHeight, scrollY, documentScrollWidth: document.documentElement.scrollWidth,
        visualViewport: window.visualViewport ? {
          width: +visualViewport.width.toFixed(2), height: +visualViewport.height.toFixed(2),
          scale: visualViewport.scale
        } : null,
        headerHeight: document.querySelector('.header')?.getBoundingClientRect().height,
        heroPadding: getComputedStyle(document.querySelector('.hero')).padding,
        gridGap: getComputedStyle(document.querySelector('.hero-grid')).gap,
        gridColumns: getComputedStyle(document.querySelector('.hero-grid')).gridTemplateColumns,
        photoLoaded: !!img && img.complete && img.naturalWidth > 0,
        photoSource: img?.getAttribute('data-media-file') || null,
        primaryHref: document.querySelector('.hero-actions a:first-child')?.getAttribute('href'),
        secondaryHref: document.querySelector('.hero-actions a:last-child')?.getAttribute('href'),
        theme: document.documentElement.dataset.theme,
        measured
      };
    }""", TARGETS)

def assert_acceptance(m, width, height, theme, errors):
    required = ("header", "toolbar", "title", "lead", "primary_cta",
                "secondary_cta", "proof", "photo", "step_1", "step_2", "step_3")
    for item in required:
        value = m["measured"].get(item)
        if not value or not value["withinViewport"]:
            errors.append(f"{width}x{height}/{theme}: {item} out of viewport: {value}")
    for item in ("primary_cta", "secondary_cta"):
        value = m["measured"].get(item)
        if not value or not value["isHitTarget"]:
            errors.append(f"{width}x{height}/{theme}: {item} is not click-hittable")
    if not m["photoLoaded"]:
        errors.append(f"{width}x{height}/{theme}: approved photo not loaded")
    if m["primaryHref"] != "#builder" or m["secondaryHref"] != "#models":
        errors.append(f"{width}x{height}/{theme}: CTA href changed")
    if m["documentScrollWidth"] > m["innerWidth"] + 2:
        errors.append(f"{width}x{height}/{theme}: horizontal overflow")
    if m["scrollY"] != 0:
        errors.append(f"{width}x{height}/{theme}: unexpected initial scroll")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["before", "after"], required=True)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--out-dir", type=Path, default=Path("docs/v74/artifacts/01-hero/screenshots"))
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.out_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(LocalOnly, directory=str(root))
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}/"
    errors = []
    rows = []
    leads = []
    try:
        with sync_playwright() as playwright:
            opts = {"headless": True}
            browser_path = os.getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
            if browser_path:
                opts["executable_path"] = browser_path
            else:
                for candidate in (
                    Path("/usr/bin/chromium"),
                    Path(os.getenv("PROGRAMFILES", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe",
                    Path(os.getenv("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
                ):
                    if candidate.is_file():
                        opts["executable_path"] = str(candidate)
                        break
            browser = playwright.chromium.launch(**opts)
            for width, height in REQUIRED + EXTRA + MOBILE:
                page = browser.new_page(
                    viewport={"width": width, "height": height},
                    device_scale_factor=1, reduced_motion="reduce",
                )
                page_errors = []
                page.on("pageerror", lambda err: page_errors.append(str(err)))
                page.route("**/api/lead", lambda route: (leads.append(route.request.url), route.abort()))
                page.goto(base, wait_until="domcontentloaded")
                try:
                    page.wait_for_function(
                        "document.querySelector('#heroMedia .v5-photo')?.complete === true",
                        timeout=9000,
                    )
                    page.evaluate("document.fonts.ready")
                except Exception as exc:
                    page_errors.append(f"asset/font readiness: {exc}")
                for theme in ("sun", "rain"):
                    page.locator(f'[data-weather="{theme}"]').click()
                    page.evaluate("window.scrollTo({left:0,top:0,behavior:'instant'})")
                    page.wait_for_timeout(220)
                    metrics = get_metrics(page)
                    metrics.update({
                        "requestedWidth": width, "requestedHeight": height,
                        "requestedZoom": "100% (deviceScaleFactor=1)",
                        "phase": args.phase, "pageErrors": list(page_errors),
                    })
                    kind = "desktop" if (width, height) in REQUIRED else ("edge" if (width, height) in EXTRA else "mobile")
                    name = f"{args.phase}-{width}x{height}-{theme}"
                    page.screenshot(path=str(output / f"{name}.png"), full_page=False, animations="disabled")
                    (output / f"{name}.json").write_text(
                        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
                    )
                    if width >= 851 and (width, height) in REQUIRED:
                        failures = []
                        assert_acceptance(metrics, width, height, theme, failures)
                        if args.phase == "after":
                            errors.extend(failures)
                        rows.append({
                            "phase": args.phase, "viewport": f"{width}x{height}",
                            "theme": theme,
                            "title_bottom": metrics["measured"]["title"]["bottom"],
                            "lead_bottom": metrics["measured"]["lead"]["bottom"],
                            "primary_cta_bottom": metrics["measured"]["primary_cta"]["bottom"],
                            "secondary_cta_bottom": metrics["measured"]["secondary_cta"]["bottom"],
                            "proof_bottom": metrics["measured"]["proof"]["bottom"],
                            "photo_bottom": metrics["measured"]["photo"]["bottom"],
                            "result": "PASS" if not failures else "FAIL",
                            "details": " | ".join(failures),
                        })
                    if metrics["documentScrollWidth"] > width + 2:
                        errors.append(f"{name}: horizontal overflow")
                    if metrics["theme"] != theme:
                        errors.append(f"{name}: weather toggle failed")
                if (width, height) == (1366, 768) and args.phase == "after":
                    # Links must work with the keyboard, not merely have href text.
                    for selector, dest in (
                        ('.hero-actions a:first-child', "#builder"),
                        ('.hero-actions a:last-child', "#models"),
                    ):
                        page.locator(selector).focus()
                        page.keyboard.press("Enter")
                        if not page.url.endswith(dest):
                            errors.append(f"keyboard activation failed: {dest}")
                        page.goto(base, wait_until="domcontentloaded")
                if args.phase == "after" and page_errors:
                    errors.extend(f"{width}x{height}: JS {e}" for e in page_errors)
                page.close()
            browser.close()
    finally:
        server.shutdown()
    with (output / f"{args.phase}-viewport-matrix.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "phase", "viewport", "theme", "title_bottom", "lead_bottom",
            "primary_cta_bottom", "secondary_cta_bottom", "proof_bottom",
            "photo_bottom", "result", "details"
        ])
        writer.writeheader()
        writer.writerows(rows)
    if leads:
        errors.append(f"Unexpected lead requests: {len(leads)}")
    print(f"PHASE={args.phase}; DESKTOP_CASES={len(rows)}; LEADS={len(leads)}; OUTPUT={output}")
    for row in rows:
        print(f"{row['viewport']} {row['theme']}: {row['result']} proof_bottom={row['proof_bottom']}")
    if errors:
        for error in errors:
            print("FAIL", error, flush=True)
        raise SystemExit(1)
    print(f"BROWSER_V74_{args.phase.upper()}=PASS" if args.phase == "after" else "BROWSER_V74_BEFORE=MEASURED (expected failures retained in CSV)")

if __name__ == "__main__":
    main()
