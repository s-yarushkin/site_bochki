"""Offline customer/content and release-safety acceptance for R73.2."""
import collections
import contextlib
import copy
import importlib.util
import json
import io
import os
import re
import shutil
import sys
import tempfile
import unittest
import urllib.parse
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'premium-r732'))
import build
import content
import install

class Inspect(HTMLParser):
    def __init__(self,s):
        super().__init__();self.h1=0;self.meta={};self.links=[];self.canonical=[];self.ids=[];self.images=[];self.feed(s)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='h1':self.h1+=1
        if tag=='meta':self.meta[a.get('name',a.get('property'))]=a.get('content','')
        if tag=='a':self.links.append(a.get('href',''))
        if tag=='link' and a.get('rel')=='canonical':self.canonical.append(a.get('href'))
        if 'id' in a:self.ids.append(a['id'])
        if tag in ['img','picture','source']:self.images.append(self.get_starttag_text())

def graphs(s):return [json.loads(m.group(1)) for m in build.SCHEMA.finditer(s)]
def typed(s,kind):return [o for g in graphs(s) for o in build.objects(g) if o.get('@type')==kind]
def app_scripts(s):return [m.group(0) for m in re.finditer(r'<script\b[^>]*>.*?</script>',s,re.S) if 'application/ld+json' not in m.group(0)]
def forms(s):return re.findall(r'<form\b.*?</form>',s,re.S)

class ContentAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=build.ROOT/'baseline';cls.raw=build.load_baseline(cls.source)
        cls.out=build.render(cls.source)
        cls.html={p:v.decode('utf-8') for p,v in cls.out.items() if p.endswith('.html')}
        cls.book=json.loads(cls.raw['data/catalog-pricebook.json'])

    def test_all_pages_indexable_unique_and_connected(self):
        self.assertEqual(len(self.html),24)
        sitemap=[e.text for e in ET.fromstring(self.out['sitemap.xml']).findall('.//{*}loc')]
        titles=[];paths={}
        for rel,s in self.html.items():
            info=Inspect(s);url=build.ORIGIN+'/'+rel[:-len('index.html')]
            self.assertEqual(info.h1,1,rel);self.assertEqual(info.canonical,[url],rel)
            self.assertIn('index,follow',info.meta['robots']);self.assertTrue(info.meta['description'])
            self.assertIn(url,sitemap);titles.extend(re.findall(r'<title>(.*?)</title>',s,re.S))
            self.assertTrue(any('/voprosy/' in h for h in info.links),rel)
            paths[urllib.parse.urlsplit(url).path]=info
            self.assertEqual(len(info.ids),len(set(info.ids)),rel)
            for org in typed(s,'Organization'):
                if org.get('@id')==build.ORIGIN+'/#organization':self.assertEqual(org['areaServed'],content.REGIONS,rel)
        self.assertEqual(len(sitemap),24);self.assertEqual(len(titles),len(set(titles)))
        reached={'/'};pending=['/']
        while pending:
            path=pending.pop()
            for href in paths[path].links:
                u=urllib.parse.urlsplit(urllib.parse.urljoin(build.ORIGIN+path,href))
                if u.hostname==urllib.parse.urlsplit(build.ORIGIN).hostname and u.path in paths and u.path not in reached:
                    reached.add(u.path);pending.append(u.path)
        self.assertEqual(set(paths),reached)

    def test_original_photos_forms_and_application_scripts_preserved(self):
        for rel,raw in self.raw.items():
            if not rel.endswith('.html'):continue
            old=raw.decode('utf-8');new=self.html[rel]
            self.assertEqual(Inspect(old).images,Inspect(new).images,rel)
            self.assertEqual(forms(old),forms(new),rel)
            self.assertEqual(app_scripts(old),app_scripts(new),rel)
        for a in content.article_data(self.book):
            self.assertEqual(Inspect(self.html['journal/'+a['slug']+'/index.html']).images,[])
        self.assertTrue(all(p.endswith(('.html','.css','.xml')) for p in self.out))
        for name in ['data/catalog-pricebook.json','robots.txt','app.mjs','content-page.mjs','analytics-runtime.mjs','lead-client.mjs','manager.html','requisites.html']:
            self.assertNotIn(name,self.out)

    def test_20_product_variants_and_size_ctas_unchanged(self):
        count=0
        for model,slug in content.SLUGS.items():
            rel='bani/'+slug+'/index.html';old=self.raw[rel].decode('utf-8');new=self.html[rel]
            for kind in ['ProductGroup','Product','Offer']:
                self.assertEqual(typed(old,kind),typed(new,kind),(rel,kind))
            old_rows=re.findall(r'<tr data-size="[^"]+">.*?</tr>',old,re.S)
            self.assertEqual(old_rows,re.findall(r'<tr data-size="[^"]+">.*?</tr>',new,re.S))
            self.assertEqual(len(old_rows),5)
            for offer in typed(new,'Offer'):
                size=urllib.parse.parse_qs(urllib.parse.urlsplit(offer['url']).query)['size'][0]
                self.assertEqual(offer['price'],content.price(self.book,model,size));count+=1
            self.assertNotIn('Надёжная проверенная печь',new)
        self.assertEqual(count,20)
        self.assertEqual(content.comfort(self.book),618022)

    def test_home_hero_calculator_unchanged_and_faq_consistent(self):
        old=self.raw['index.html'].decode('utf-8');new=self.html['index.html']
        old_main=build.element(old,'main');new_main=build.element(new,'main')
        a=build.replace_element(old_main,'section','id','questions','')
        b=build.replace_element(new_main,'section','id','questions','')
        self.assertEqual(a,b)
        home_questions=re.findall(r'<summary>(.*?)<span',build.element(new,'div','class','faq-list'),re.S)
        faq_questions=re.findall(r'<summary>(.*?)<span',build.element(self.html['voprosy/index.html'],'div','class','faq-list'),re.S)
        self.assertEqual(len(home_questions),6);self.assertEqual(len(faq_questions),14)
        self.assertEqual(home_questions,faq_questions[:6])
        self.assertIn('обязательная сборка бани уже включена',new)
        self.assertNotIn('10% базы',self.html['compare/index.html'])

    def test_known_documents_and_original_articles_are_retained(self):
        original=[p for p in self.raw if p.startswith('journal/') and p!='journal/index.html']
        self.assertEqual(len(original),10)
        for rel in original:self.assertIn(rel,self.html)
        for rel,s in self.html.items():
            self.assertIn('/requisites.html',s,rel)
        new=content.article_data(self.book)
        for a in new:
            s=self.html['journal/'+a['slug']+'/index.html']
            self.assertEqual(len(typed(s,'Article')),1)
            for ident,_,_ in a['sections']:self.assertIn('id="'+ident+'"',s)
        # Do not invent optional facts to fill out the text-only release.
        combined=' '.join(self.html.values())
        for phrase in ['гарантия 5 лет','гарантия 10 лет','доставка бесплатно','прогрев за 30 минут','за 7 дней','на 6 человек']:
            self.assertNotIn(phrase,combined.lower())

    def test_wrong_source_and_pricebook_changes_abort(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'source';shutil.copytree(self.source,source)
            p=source/'compare/index.html';p.write_bytes(p.read_bytes()+b'\n')
            with self.assertRaisesRegex(RuntimeError,'SOURCE_CHANGED'):build.render(source)
        changed=copy.deepcopy(self.book);changed['options']['stove_guard']['unitPriceRub']+=100
        with self.assertRaisesRegex(RuntimeError,'FEATURED_BUNDLE_PRICE_CHANGED'):content.comfort(changed)

    @unittest.skipUnless(os.name=='posix','Linux symlink release rehearsal; executed in CI and on the server OS')
    def test_installer_keeps_protected_tree_and_rolls_back_failed_smoke(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp);releases=base/'web/releases';releases.mkdir(parents=True)
            web=releases/build.MANIFEST['source_release'];shutil.copytree(self.source,web)
            for name in ['app.mjs','lead-client.mjs','analytics-runtime.mjs','manager.html','privacy.html','consent.html','requisites.html','content-page.mjs']:(web/name).write_text('PROTECTED-'+name)
            (web/install.PROOF).write_text('Verification: b6454ce0d283ef63')
            assets=web/'assets';assets.mkdir();(assets/'owner-photo.webp').write_bytes(b'EXISTING_PHOTO')
            apiroot=base/'api/releases';apiroot.mkdir(parents=True);api=apiroot/build.MANIFEST['api_release'];api.mkdir()
            web_link=base/'web/current';web_link.symlink_to(web)
            api_link=base/'api/current';api_link.symlink_to(api)
            outputs,before=install.preflight(web,api)
            def fail(*_):raise RuntimeError('SYNTHETIC_PUBLIC_FAILURE')
            log=io.StringIO()
            with contextlib.redirect_stdout(log):
                with self.assertRaisesRegex(RuntimeError,'SYNTHETIC_PUBLIC_FAILURE'):
                    install.activate(web,api,outputs,before,'1'*40,web_link,api_link,fail)
            self.assertIn('R732_ROLLBACK=PASS',log.getvalue())
            self.assertEqual(web_link.resolve(),web);self.assertEqual(api_link.resolve(),api)
            self.assertEqual(install.inventory(web),before)
            previous_umask=os.umask(0o077)
            try:
                with contextlib.redirect_stdout(log):
                    dest=install.activate(web,api,outputs,before,'2'*40,web_link,api_link,lambda *_:None)
            finally:os.umask(previous_umask)
            self.assertEqual(web_link.resolve(),dest);self.assertEqual(api_link.resolve(),api)
            after=install.inventory(dest)
            for name,value in before.items():
                if name not in outputs:self.assertEqual(after[name],value,name)
            self.assertEqual((dest/'r732-content.css').stat().st_mode & 0o777,(web/'index.html').stat().st_mode & 0o777)
            self.assertEqual((dest/'journal/kak-prinyat-gotovuyu-banyu').stat().st_mode & 0o777,(web/'journal').stat().st_mode & 0o777)
            with self.assertRaisesRegex(RuntimeError,'SOURCE_CHANGED'):build.render(dest)

if __name__=='__main__':unittest.main()
