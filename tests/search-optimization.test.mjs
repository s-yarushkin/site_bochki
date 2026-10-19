import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readLandingModel} from '../assets/js/landing-model.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(join(root,'seo/pages.json'),'utf8'));
const cat=JSON.parse(readFileSync(join(root,'data/catalog-pricebook.json'),'utf8'));
const read=path=>readFileSync(join(root,path),'utf8');
test('search pages have unique canonical URLs, title/H1, visible HTML and valid JSON-LD',()=>{
 const titles=new Set(),h1s=new Set();assert.equal(manifest.pages.length,9);
 for(const p of manifest.pages){
  const html=read(p.file);const canonical=[...html.matchAll(/rel="canonical" href="([^"]+)"/g)];
  assert.deepEqual(canonical.map(x=>x[1]),[manifest.origin+p.path]);
  const title=html.match(/<title>(.*?)<\/title>/s)[1],h1=html.match(/<h1[^>]*>(.*?)<\/h1>/s)[1];
  assert.ok(!titles.has(title));titles.add(title);assert.ok(!h1s.has(h1));h1s.add(h1);
  assert.equal([...html.matchAll(/<h1\b/g)].length,1);
  assert.match(html,/name="robots" content="index,follow,max-image-preview:large"/);
  for(const node of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/sg)){
   const graph=JSON.parse(node[1])['@graph'];assert.ok(graph.length>=2);
   for(const entity of graph){assert.ok(!entity.aggregateRating);assert.ok(!entity.geo);assert.notEqual(entity['@type'],'LocalBusiness');}
  }
 }
});
test('every public page link and asset resolves locally, without a JavaScript renderer',()=>{
 for(const p of manifest.pages){
  const html=read(p.file);
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const url=new URL(match[1],manifest.origin+p.path);
   if(url.origin!==manifest.origin)continue;
   const path=decodeURIComponent(url.pathname);
   assert.ok(!path.includes('/bani-preview/'));
   const file=join(root,path.endsWith('/')?path+'index.html':path);
   assert.ok(existsSync(file),p.path+' -> '+path);
   if(url.hash){const target=read(path.endsWith('/')?path.slice(1)+'index.html':path.slice(1));assert.ok(target.includes('id="'+url.hash.slice(1)+'"'),url.href);}
  }
 }
});
test('product pages use the existing sizes and indicative amounts without fake Offers or ratings',()=>{
 for(const [id,slug] of [['kvadro','kvadro'],['parus','parus'],['viking','viking'],['kvadro-house','kvadro-haus']]){
  const html=read('bani/'+slug+'/index.html');
  for(const amount of Object.values(cat.prices[id]))assert.ok(html.includes(amount.toLocaleString('ru-RU')+' ₽'));
  assert.doesNotMatch(html,/"(?:offers|aggregateRating|review|availability)"/);
  assert.match(html,/не является офертой/);assert.equal([...html.matchAll(/<li>/g)].length,19);
  assert.ok(html.includes('/?model='+id+'#builder'));
 }
});
test('sitemap covers only public canonical pages; legal and manager stay noindex',()=>{
 const urls=[...read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]);
 assert.deepEqual(urls,manifest.pages.map(p=>manifest.origin+p.path));
 for(const path of ['manager.html','privacy.html','consent.html','requisites.html'])assert.match(read(path),/noindex/);
 assert.match(read('robots.txt'),/User-agent: \*\nAllow: \/\nDisallow: \/api\//);
 assert.match(read('robots.txt'),/User-agent: GPTBot\nDisallow: \//);
 assert.ok(!read('robots.txt').includes('User-agent: OAI-SearchBot\nDisallow: /'));
});
test('landing model parameters select only known catalog models and ignore hostile inputs',()=>{
 const models=Object.keys(cat.models).map(id=>({id}));
 for(const m of models)assert.equal(readLandingModel('?model='+m.id,models).id,m.id);
 for(const q of ['', '?model=__proto__','?model=https://evil.example','?model=%3Cscript%3E','?model=unknown'])assert.equal(readLandingModel(q,models),null);
});
test('search page generation is reproducible from the shared catalog and accepted base-kit source',()=>{
 const names=[...manifest.pages.filter(p=>p.path!=='/').map(p=>p.file),'robots.txt','sitemap.xml','llms.txt','seo/pages.json'];
 const before=names.map(read);execFileSync(process.execPath,['scripts/build-search-pages.mjs'],{cwd:root});
 assert.deepEqual(names.map(read),before);
});

test('public commercial pages and AI index contain no company phone or internal priority language',()=>{
 for(const p of manifest.pages){
  const html=read(p.file);assert.doesNotMatch(html,/"telephone"|293[- ]?46|[Пп]риоритет/);
  if(p.path!=='/')assert.match(html,/href="tel:\+79517349999"/);
  if(p.path!=='/')assert.match(html,/Связаться с менеджером/);
 }
 assert.doesNotMatch(read('llms.txt'),/293[- ]?46|[Пп]риоритет/);
 assert.match(read('requisites.html'),/293/);
});
