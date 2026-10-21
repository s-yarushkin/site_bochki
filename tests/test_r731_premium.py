#!/usr/bin/env python3
"""Offline R73.1 narrow overlay checks; no live SQLite, API, MAX or external calls."""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r731',ROOT/'premium-r731/r731-web-installer.py')
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class R731Contracts(unittest.TestCase):
    def old_home(self):
        return ('<html><head>'
                '<link rel="stylesheet" href="choice-r7.css">'
                '<script src="app.mjs?v=r73-legal-20261021" type="module"></script>'
                '<script type="application/ld+json">{"areaServed":["Москва","Московская область","Вологодская область","Ярославская область"]}</script>'
                '</head><body><form id="relay-lead-form">'
                '<button id="relay-submit" aria-describedby="relay-consent">Отправить заявку</button>'
                '<p id="relay-consent">Отправляя заявку, вы подтверждаете</p></form>'
                '<span id="installation-label">Монтаж «Квадро Хаус» · обязательно, 10% базы</span>'
                '<section class="journal-teaser section wrap"><h2>Old articles retained</h2></section>'
                '<p>Москва и область · Вологда · Ярославль</p>'
                '</body></html>')
    def old_app(self):
        return ("const untouchedPriceFormula=(p)=>p.base+p.extras+p.installation;\n"
                "const unchangedAnalytics=analytics.confirmed(result.receipt,{flow,requestId:payload.requestId});\n"
                "payload.consentVersion = '2026-10-21';\n"
                "$('#installation-label').textContent = q.installation?'Монтаж «Квадро Хаус» · обязательно, 10% базы':'';\n")
    def test_home_surgical_diff(self):
        old=self.old_home()
        result=m.home(old)
        self.assertIn('Old articles retained',result)
        self.assertIn('id="relay-consent"',result)
        self.assertIn('id="relay-submit"',result)
        self.assertIn('Сборка бани на участке',result)
        self.assertNotIn('10% базы',result)
        self.assertIn('r731-finish-picker.mjs',result)
        self.assertIn('r731-supplement.css',result)
        self.assertIn('Ленинградская область',result)
        self.assertIn('r731-regions-title',result)
        with self.assertRaises(RuntimeError):
            m.home(result)
    def test_calc_preserved(self):
        old=self.old_app()
        result=m.app(old)
        self.assertEqual(result.count('untouchedPriceFormula'),1)
        self.assertIn('p.base+p.extras+p.installation',result)
        self.assertIn('analytics.confirmed(result.receipt',result)
        self.assertIn("payload.consentVersion = '2026-10-21';",result)
        self.assertIn("q.installation?'Сборка бани на участке':''",result)
        with self.assertRaises(RuntimeError):
            m.app(result)
    def test_seo_region_coverage_and_markup(self):
        old='<html><head><script type="application/ld+json">{"areaServed":[{"@type":"AdministrativeArea","name":"Ярославская область"}]}</script></head><body><main><h1>Доставка</h1></main></body></html>'
        result=m.seo(old)
        self.assertIn('Ленинградская область',result)
        self.assertIn('Регионы работы',result)
        self.assertIn('r731-supplement.css',result)
        self.assertIn('AdministrativeArea","name":"Ленинградская область"',result)
        with self.assertRaises(RuntimeError):
            m.seo(result)
    def test_catalog_media_exact_and_no_price_rewrite(self):
        data=json.loads((ROOT/'data/catalog-pricebook.json').read_text(encoding='utf-8'))
        self.assertEqual(tuple(v['id'] for v in data['finishes']['body']),m.BODY)
        self.assertEqual(tuple(v['id'] for v in data['finishes']['roof']),m.ROOF)
        self.assertEqual(sum(map(len,data['prices'].values())),20)
        manifest=json.loads((ROOT/'assets/catalog-v66/MEDIA-MANIFEST.json').read_text(encoding='utf-8'))
        names={x['file'] for x in manifest['images']}
        for kind,ids in [('body',m.BODY),('roof',m.ROOF)]:
            for id in ids:self.assertIn(f'{kind}-{id}.webp',names)
    def test_visual_picker_never_invents_options(self):
        js=(ROOT/'premium-r731/r731-finish-picker.mjs').read_text(encoding='utf-8')
        self.assertIn('Array.from(select.options)',js)
        self.assertIn('select.dispatchEvent(new Event(',js)
        self.assertIn("button.disabled = true",js)
        self.assertIn("field.insertAdjacentElement('afterend', palette)",js)
        self.assertNotIn("select.insertAdjacentElement('afterend', palette)",js)
        self.assertIn("MutationObserver(draw)",js)
        self.assertIn("aria-pressed",js)

if __name__=='__main__':
    unittest.main()
