#!/usr/bin/env python3
"""ADS-01 isolated Chromium acceptance. Never touches production or the real Yandex API."""
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/ads01/artifacts/browser"
OUT.mkdir(parents=True, exist_ok=True)

class MockSite(SimpleHTTPRequestHandler):
    enable_analytics = False
    reply_code = 200
    reply_body = {"ok": True, "delivered": True, "analytics": {"persisted": True, "premiumQualified": True, "detailedQualified": False}}
    posts = []
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, fmt, *args):
        pass
    def do_GET(self):
        if urlsplit(self.path).path == "/assets/js/analytics-config.js" and type(self).enable_analytics:
            body = b"export const ADS01_COUNTER_ID=1; export const ADS01_PRIVACY_APPROVED=true; // MOCK ONLY\n"
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()
    def do_POST(self):
        if urlsplit(self.path).path != "/api/lead":
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        type(self).posts.append(json.loads(body))
        result = json.dumps(type(self).reply_body).encode()
        self.send_response(type(self).reply_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(result)))
        self.end_headers()
        self.wfile.write(result)

def goals(page):
    return page.evaluate("() => (window.ym?.a || []).filter(x=>x[1]==='reachGoal').map(x=>x[2])")

def open_and_send(page, city="Ногинск"):
    page.locator(".builder-aside [data-flow='quote']").click()
    page.locator("#formExtra summary").click()
    page.locator("#contactForm [name='district']").fill(city)
    page.locator("#contactForm [name='phone']").fill("+7 (921) 234-56-78")
    page.locator("#submitButton").click()

def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockSite)
    runner = threading.Thread(target=server.serve_forever, daemon=True)
    runner.start()
    origin = "http://127.0.0.1:" + str(server.server_address[1])
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            # Default: counter disabled, no Yandex requests, home and eight SEO pages render.
            MockSite.enable_analytics = False
            c = browser.new_context(viewport={"width": 1366, "height": 768})
            page = c.new_page()
            requests = []
            page.on("request", lambda r: requests.append(r.url) if "mc.yandex.ru" in r.url else None)
            for path in ["/","/bani/","/bani/kvadro/","/bani/viking/","/bani/parus/","/bani/kvadro-haus/","/dostavka-i-ustanovka/","/voprosy/","/kontakty/"]:
                page.goto(origin + path, wait_until="domcontentloaded")
                page.wait_for_timeout(90)
                assert not page.locator("script[data-dp-metrika]").count(), path
            assert not requests, "external Yandex requests before real GO"
            for width in [320,390,768,1366,1920]:
                page.set_viewport_size({"width":width,"height":768 if width>768 else 780})
                page.goto(origin + "/", wait_until="domcontentloaded")
                for weather in ["sun","rain"]:
                    page.locator("[data-weather='"+weather+"']").click()
                    assert page.locator("html").get_attribute("data-theme") == weather
                    if width in [320,1366]:
                        page.screenshot(path=str(OUT / ("offline-"+str(width)+"-"+weather+".png")), full_page=False)
            c.close()
            # Owner-approved counter simulated only through localhost in-memory script override.
            MockSite.enable_analytics = True
            c = browser.new_context(viewport={"width":1366,"height":768})
            page = c.new_page()
            requested = []
            page.route("https://mc.yandex.ru/**", lambda route: (requested.append(route.request.url), route.fulfill(status=200, content_type="application/javascript", body="// offline test receiver")))
            page.goto(origin + "/", wait_until="domcontentloaded")
            page.get_by_role("button", name="Без аналитики").wait_for()
            assert not page.locator("script[data-dp-metrika]").count(), "track before consent"
            page.get_by_role("button", name="Разрешить аналитику").click()
            page.wait_for_timeout(130)
            assert page.locator("script[data-dp-metrika]").count()==1
            page.locator("[data-track='hero_builder']").click()
            assert "dp_cta_click" in goals(page), goals(page)
            MockSite.reply_code=200
            MockSite.reply_body={"ok":True,"delivered":True,"analytics":{"persisted":True,"premiumQualified":True,"detailedQualified":False}}
            open_and_send(page)
            page.locator("#formResult").wait_for(state="visible")
            assert goals(page).count("dp_lead_confirmed")==1,goals(page)
            assert goals(page).count("dp_premium_quote_confirmed")==1,goals(page)
            assert len(MockSite.posts)==1 and MockSite.posts[0]["district"]=="Ногинск"
            assert not any(k in json.dumps(page.evaluate("() => window.ym?.a || []"),ensure_ascii=False) for k in ["9212345678","Ногинск","GB-"]), "PII in external goal calls"
            # Server duplicate must never create another primary conversion.
            page.locator("#dialogClose").click()
            MockSite.reply_body={"ok":True,"delivered":True,"duplicate":True,"analytics":{"persisted":True,"premiumQualified":True}}
            open_and_send(page)
            page.locator("#formResult").wait_for(state="visible")
            assert goals(page).count("dp_premium_quote_confirmed")==1,goals(page)
            # Delivery 502: no primary conversion.
            page.locator("#dialogClose").click()
            MockSite.reply_code=502
            MockSite.reply_body={"ok":False,"code":"DELIVERY_UNAVAILABLE"}
            open_and_send(page)
            page.wait_for_selector("#formError:not(:empty)")
            assert goals(page).count("dp_premium_quote_confirmed")==1,goals(page)
            assert len(requested)<=1, "duplicate Yandex tag load"
            c.close()
            browser.close()
            print("ADS01_CHROMIUM=PASS; SEO_ROUTES=9; WIDTHS=5; THEMES=2; MOCK_LEADS=%d; PRODUCTION_POSTS=0; REAL_YANDEX_CALLS=0" % len(MockSite.posts))
    finally:
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    main()
