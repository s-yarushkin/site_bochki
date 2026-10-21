"""Integration test of EXACT production R73.1 HTML against proposed 8-page SEO overlay.

HTTP GET public pages only. No lead requests/manager/SQLite/MAX.
"""
import hashlib
import importlib.util
import json
import unittest
import urllib.request
import urllib.parse
import ssl
from bs4 import BeautifulSoup

SPEC=importlib.util.spec_from_file_location("seo_overlay","premium-r731/r731-commercial-seo-install.py")
m=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
ORIGIN="https://xn--80aaan1dh9b.xn--p1ai"

def live(rel):
    req=urllib.request.Request(ORIGIN+"/"+rel,headers={
        "User-Agent":"DachaPar-CI-SEO-2026-10-21","Accept-Encoding":"identity"})
    with urllib.request.urlopen(req,timeout=20,context=ssl.create_default_context()) as r:
        assert r.status==200 and urllib.parse.urlsplit(r.geturl()).hostname=="xn--80aaan1dh9b.xn--p1ai"
        return r.read()

class CommercialSEO(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pricebook=json.loads(live("data/catalog-pricebook.json"))
        cls.original={}
        cls.updated={}
        for name,expected in m.EXPECTED.items():
            data=live(name)
            assert hashlib.sha256(data).hexdigest()==expected, "PUBLIC_SOURCE_CHANGED_"+name
            cls.original[name]=data.decode("utf-8")
            cls.updated[name]=m.transform(name,cls.original[name],cls.pricebook)
        print("EXACT_PUBLIC_PAGE_SHA_VERIFIED="+str(len(cls.original)))

    def test_all_exact_source_pages_only_changed_by_expected_overlay(self):
        self.assertEqual(len(self.updated),8)
        for name,s in self.updated.items():
            old=BeautifulSoup(self.original[name],"html.parser")
            new=BeautifulSoup(s,"html.parser")
            self.assertEqual(old.title.text,new.title.text,name)
            self.assertEqual([x.get("href") for x in old.select('link[rel="canonical"]')],
                             [x.get("href") for x in new.select('link[rel="canonical"]')],name)
            self.assertEqual(len(old.select('meta[name="robots"]')),len(new.select('meta[name="robots"]')),name)
            self.assertEqual(len(old.select('h1')),len(new.select('h1')),name)
            self.assertEqual(len(old.select('main')),len(new.select('main')),name)
            self.assertEqual(len(old.select('a[href^="tel:"]')),len(new.select('a[href^="tel:"]')),name)
            with self.assertRaises(RuntimeError):
                m.transform(name,s,self.pricebook)
        print("SINGLE_APPLICATION_FENCE=PASS; CANONICAL_H1_META_TEL_RETAINED=YES")

    def test_house_catalog_vs_detail_transparent_same_price(self):
        catalog=BeautifulSoup(self.updated["bani/index.html"],"html.parser")
        house=catalog.select_one('a[href="../bani/kvadro-haus/"]')
        self.assertIsNotNone(house)
        words=house.get_text(" ",strip=True)
        for phrase in ("649","590","59","сборк"):
            self.assertIn(phrase,words)
        self.assertNotIn("от 590",words)
        detail=self.updated["bani/kvadro-haus/index.html"]
        soup=BeautifulSoup(detail,"html.parser")
        rows=soup.select("section.dp-house-price-split tbody tr")
        self.assertEqual(len(rows),5)
        pricebook=self.pricebook["prices"]["kvadro-house"]
        sizes=("4x4","5x4","6x4","6x5","6x6")
        for tr,code in zip(rows,sizes):
            cells=[x.get_text(" ",strip=True) for x in tr.find_all(["td","th"])]
            numeric=[int("".join(x for x in a if x.isdigit())) for a in cells[1:]]
            base=pricebook[code]
            self.assertEqual(numeric,[base,base//10,base+base//10],code)
        self.assertNotIn(m.PRICE_COPY,detail)
        self.assertIn("обязательную сборку на участке",detail)

    def test_four_models_unique_factual_sections(self):
        for model in ("kvadro","parus","viking","kvadro-haus"):
            soup=BeautifulSoup(self.updated["bani/"+model+"/index.html"],"html.parser")
            self.assertEqual(len(soup.select("section.dp-model-truth")),1)
            self.assertGreaterEqual(len(soup.select("section.dp-model-truth .related-links a")),3)
            breadcrumb=[json.loads(x.text) for x in soup.select('script[type="application/ld+json"]')]
            breadcrumb=[y for x in breadcrumb for y in (x if isinstance(x,list) else x.get("@graph",[x])) if y.get("@type")=="BreadcrumbList"]
            self.assertEqual(len(breadcrumb),1)
            self.assertEqual(len(breadcrumb[0]["itemListElement"]),3)
            self.assertEqual(breadcrumb[0]["itemListElement"][1]["name"],"Каталог бань")
            schema=[y for x in breadcrumb if isinstance(x,dict) for y in [x] if y.get("@type")=="ProductGroup"]
            self.assertEqual(len(soup.select('script[type="application/ld+json"]')),
                             len(BeautifulSoup(self.original["bani/"+model+"/index.html"],"html.parser").select('script[type="application/ld+json"]')))

    def test_articles_use_commercial_contextual_links(self):
        pages=("kak-vybrat-gotovuyu-banyu","iz-chego-skladyvaetsya-tsena","kvadro-5-komfort")
        for p in pages:
            page=BeautifulSoup(self.updated["journal/"+p+"/index.html"],"html.parser")
            links=page.select("section.dp-article-to-products a")
            self.assertGreaterEqual(len(links),2)
            for anchor in links:self.assertTrue(anchor.get("href","").startswith("../../"),p)
        self.assertNotIn("+10% от базовой цены",self.updated["journal/kak-vybrat-gotovuyu-banyu/index.html"])
        self.assertNotIn("59 000 ₽ монтаж",self.updated["journal/iz-chego-skladyvaetsya-tsena/index.html"])

    def test_unchanged_pricebook_20_values(self):
        self.assertEqual(m.CATALOG_VERSION,self.pricebook["version"])
        self.assertEqual(sum(len(x) for x in self.pricebook["prices"].values()),20)
        self.assertEqual(self.pricebook["prices"]["kvadro-house"]["4x4"],590000)
        self.assertEqual(self.pricebook["prices"]["kvadro"]["400"],390000)

if __name__=="__main__":unittest.main()
