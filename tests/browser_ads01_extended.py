#!/usr/bin/env python3
"""ADS-01 extended offline acceptance: actual CTA hooks, funnel, Webvisor OFF and failure routes.
Only loopback local HTTP; mocked Yandex tag and MAX/SQLite API; no production leads.
"""
import json
import threading
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from browser_ads01 import MockSite, goals

def main():
    MockSite.enable_analytics = True
    MockSite.posts=[]
    MockSite.reply_code=200
    MockSite.reply_body={"ok":True,"delivered":True,"analytics":{"persisted":True,"premiumQualified":True,"detailedQualified":True}}
    server=ThreadingHTTPServer(("127.0.0.1",0),MockSite)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin="http://127.0.0.1:"+str(server.server_address[1])
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            c=browser.new_context(viewport={"width":1366,"height":900})
            p0=c.new_page()
            external=[]
            p0.route("https://mc.yandex.ru/**", lambda route:(external.append(route.request.url),route.fulfill(status=200,content_type="application/javascript",body="// MOCKED TAG; NO EXTERNAL NETWORK")))
            url=origin+"/?utm_source=yandex&utm_medium=cpc&utm_campaign=test_a&yclid=MOCK-A1"
            p0.goto(url,wait_until="domcontentloaded")
            p0.wait_for_function("() => typeof window.ym === 'function'")
            assert p0.locator("script[data-dp-metrika]").count()==1
            assert p0.get_by_role("button",name="Разрешить аналитику").count()==0
            assert p0.get_by_role("button",name="Без аналитики").count()==0
            assert p0.locator('[data-dp-consent]').count()==0
            assert p0.evaluate("() => window.ym.a.some(x=>x[1]==='init' && x[2].webvisor===false)")
            p0.reload(wait_until="domcontentloaded")
            p0.wait_for_function("() => typeof window.ym === 'function'")
            assert p0.locator("script[data-dp-metrika]").count()==1
            # Visitors can browse immediately; the site does not insert analytics controls.
            c2=browser.new_context(viewport={"width":1366,"height":900})
            page=c2.new_page()
            errors=[]
            page.on("pageerror",lambda error: errors.append(str(error)))
            outbound=[]
            page.route("https://mc.yandex.ru/**",lambda route:(outbound.append(route.request.url),route.fulfill(status=200,content_type="application/javascript",body="// MOCKED TAG")))
            page.goto(url,wait_until="domcontentloaded")
            page.wait_for_function("() => typeof window.ym==='function' && !!window.__GARANT_DEMO__")
            assert page.locator('[data-dp-consent]').count()==0
            assert page.get_by_role("button",name="Настройки аналитики").count()==0
            original=json.loads(page.evaluate("() => localStorage.getItem('dp_attribution_v1')"))
            assert original["first"]["utm_campaign"]=="test_a",original
            assert original["first"]["yclid"]=="MOCK-A1",original
            assert page.locator("script[data-dp-metrika]").count()==1
            assert len(outbound)==1,outbound
            # Real CTAs from three distinct placements, plus call-to-action and flow controls.
            page.locator("header a[href^='tel:']").first.click()
            assert goals(page).count("dp_phone_click")==1,goals(page)
            page.locator("footer a[href^='tel:']").first.click()
            assert goals(page).count("dp_phone_click")==2,goals(page)
            page.locator("[data-track='hero_builder']").click()
            assert "dp_cta_click" in goals(page)
            page.locator("header [data-flow='callback']").first.click()
            page.locator("#contactDialog[open]").wait_for()
            assert "dp_form_open" in goals(page)
            page.locator("#dialogClose").click()
            page.wait_for_function("() => (window.ym?.a||[]).some(x=>x[1]==='reachGoal' && x[2]==='dp_form_close')")
            # Dynamic cards after JS render: approved model view and selection.
            card=page.locator(".product-card[data-model='kvadro-house']")
            card.scroll_into_view_if_needed()
            page.wait_for_timeout(250)
            assert "dp_model_view" in goals(page),goals(page)
            card.locator("[data-catalog-select]").click()
            assert "dp_model_select" in goals(page)
            # Full seven step journey with actual model and price >750K.
            page.locator("[data-choose-size='6x6']").click()
            assert "dp_size_select" in goals(page)
            for i in range(4):
                page.locator("#builderNext").click()
            assert page.locator("#regionInput").count()==1
            page.locator("#regionInput").fill("Ногинск")
            page.locator("#builderNext").click()
            assert "dp_builder_complete" in goals(page)
            assert "dp_builder_start" in goals(page)
            MockSite.reply_code=200
            MockSite.reply_body={"ok":True,"delivered":True,"analytics":{"persisted":True,"premiumQualified":True,"detailedQualified":True}}
            page.locator(".builder-aside [data-flow='quote']").click()
            page.locator("#contactDialog[open]").wait_for()
            assert page.locator("#contactForm [name='district']").input_value()=="Ногинск"
            assert page.locator("#formExtra summary").count()==1
            page.locator("#contactForm [name='phone']").fill("+7 (921) 234-56-78")
            page.locator("#submitButton").click()
            page.locator("#formResult").wait_for(state="visible")
            payload=MockSite.posts[-1]
            assert payload["district"]=="Ногинск"
            assert payload["journeyComplete"] is True
            assert payload["configuration"]["modelId"]=="kvadro-house"
            assert payload["configuration"]["sizeId"]=="6x6"
            assert goals(page).count("dp_premium_quote_confirmed")==1,goals(page)
            assert goals(page).count("dp_detailed_quote_confirmed")==1,goals(page)
            assert goals(page).count("dp_lead_confirmed")==1,goals(page)
            assert not any(k in json.dumps(page.evaluate("() => window.ym.a || []"),ensure_ascii=False) for k in ["9212345678","Ногинск","MOCK-A1"]),"no PII or campaign ID to goal params"
            page.locator("#dialogClose").click()
            # Failure statuses do not become primary goals.
            for status in [400,429,502]:
                MockSite.reply_code=status
                MockSite.reply_body={"ok":False,"code":("VALIDATION_ERROR" if status==400 else "RATE_LIMITED" if status==429 else "DELIVERY_UNAVAILABLE")}
                page.locator(".builder-aside [data-flow='quote']").click()
                page.locator("#contactForm [name='phone']").fill("+7 (921) 234-56-78")
                page.locator("#submitButton").click()
                page.locator("#formError:not(:empty)").wait_for()
                assert goals(page).count("dp_premium_quote_confirmed")==1,(status,goals(page))
                page.locator("#dialogClose").click()
            page.route("**/api/lead",lambda route:route.abort())
            page.locator(".builder-aside [data-flow='quote']").click()
            page.locator("#contactForm [name='phone']").fill("+7 (921) 234-56-78")
            page.locator("#submitButton").click()
            page.locator("#formError:not(:empty)").wait_for()
            assert goals(page).count("dp_premium_quote_confirmed")==1
            page.locator("#dialogClose").click()
            page.unroute("**/api/lead")
            # Distinct last touch must not overwrite first touch.
            page.goto(origin+"/?utm_source=yandex&utm_campaign=test_b&yclid=MOCK-B2",wait_until="domcontentloaded")
            page.wait_for_function("() => !!window.ym")
            stored=json.loads(page.evaluate("() => localStorage.getItem('dp_attribution_v1')"))
            assert stored["first"]["utm_campaign"]=="test_a",stored
            assert stored["last"]["utm_campaign"]=="test_b",stored
            assert stored["last"]["yclid"]=="MOCK-B2",stored
            # SEO pages and phone links use a single adapter.
            seo=["/bani/","/bani/kvadro/","/bani/viking/","/bani/parus/","/bani/kvadro-haus/","/dostavka-i-ustanovka/","/voprosy/","/kontakty/"]
            for path in seo:
                page.goto(origin+path,wait_until="domcontentloaded")
                page.wait_for_function("() => typeof window.ym==='function'")
                assert page.locator("script[data-dp-metrika]").count()==1,path
                page.locator("a[href^='tel:']").first.click()
                assert goals(page).count("dp_phone_click")==1,(path,goals(page))
            # Mobile sticky CTA has both direct call and callback.
            page.set_viewport_size({"width":390,"height":844})
            page.goto(origin+"/",wait_until="domcontentloaded")
            page.wait_for_function("() => !!window.__GARANT_DEMO__ && typeof window.ym==='function'")
            page.locator(".mobile-cta a[href^='tel:']").click()
            assert goals(page).count("dp_phone_click")==1
            page.locator(".mobile-cta [data-flow='callback']").click()
            page.locator("#contactDialog[open]").wait_for()
            assert goals(page).count("dp_form_open")==1
            # No analytics pop-up or injected footer CTA after any user flow.
            page.locator("#dialogClose").click()
            assert page.get_by_role("button",name="Без аналитики").count()==0
            assert page.get_by_role("button",name="Разрешить аналитику").count()==0
            assert page.get_by_role("button",name="Настройки аналитики").count()==0
            assert not page.locator('[data-dp-consent]').count()
            assert not errors,errors
            c2.close();c.close();browser.close()
            print("ADS01_EXTENDED_BROWSER=PASS; REAL_CTA_DESKTOP_MOBILE=PASS; 8_SEO_PHONE_GOALS=PASS; 3_HTTP_ERROR_PATHS_PLUS_ABORT=PASS; 7_STEP_JOURNEY=PASS; UTM_FIRST_LAST=PASS; NO_BANNER=PASS; WEBVISOR_OFF=PASS; REAL_MAX=0; PRODUCTION_POSTS=0; REAL_YANDEX_REQUESTS=0")
    finally:
        server.shutdown();server.server_close()

if __name__=="__main__":
    main()
