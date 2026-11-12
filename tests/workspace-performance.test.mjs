import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {noticePosition,promotionUrl} from '../web/campaigns/blackfriday-notice.mjs';
const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8');
test('notice retains attribution and selection and does not cover protected controls',()=>{
 const url=new URL(promotionUrl('https://example.test/?bath=parus&bathSize=550&package=deluxe&utm_source=yandex&utm_campaign=bf&yclid=123&phone=private#plans'),'https://example.test');
 assert.equal(url.pathname,'/blackfriday/');assert.equal(url.searchParams.get('size'),'550');assert.equal(url.searchParams.get('utm_campaign'),'bf');assert.equal(url.searchParams.has('phone'),false);
 const anchor={left:100,top:280,right:600,bottom:540};const p=noticePosition(anchor,300,223,{width:1440,height:900},[anchor]);assert.deepEqual(p,{x:614,y:280});
 const mobileAnchor={left:20,right:360,top:145,bottom:672};const mobile=noticePosition(mobileAnchor,260,80,{width:390,height:844},[mobileAnchor,{left:20,right:360,top:685,bottom:736},{left:0,right:380,top:0,bottom:56}]);assert.ok(mobile&&mobile.y>=744);
 assert.equal(noticePosition({left:0,right:390,top:0,bottom:844},260,200,{width:390,height:844},[{left:0,right:390,top:0,bottom:844}]),null);
});
test('compact display data retains all twenty sizes and forty approved prices',()=>{
 const slim=JSON.parse(read('web/choice/display-prices.json')),full=JSON.parse(read('web/choice/catalog-pricebook.json'));let count=0;
 assert.deepEqual(slim.prices,full.prices);assert.equal(slim.version,full.version);
 for(const [m,model]of Object.entries(full.r85.models))for(const [s,row]of Object.entries(model.sizes)){const v=slim.r85.models[m].sizes[s];assert.equal(v.label,row.label);assert.equal(v.priceRub,row.priceRub);assert.equal(v.deluxe.priceRub,row.deluxe.priceRub);count+=2;}
 assert.equal(count,40);assert.ok(Buffer.byteLength(JSON.stringify(slim))<2500);
});
test('built home preserves body markup and image bytes; initial graph is small and heavy viewer stays dynamic',()=>{
 const report=JSON.parse(read('.local/crm-speed-20261111/build.json'));let after=read('web/index.html'),before=read('.local/crm-speed-20261111/preview-web/index.html');
 for(const [name,info]of Object.entries(report.aliases))after=after.replaceAll('/'+name,'/'+info.source);
 const body=h=>h.slice(h.indexOf('<body')).replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/\s+/g,' ').trim();assert.equal(body(after),body(before));
 assert.ok(report.initial_js_files<=4);assert.ok(report.initial_js_bytes<220000);assert.equal(report.images_byte_identical,true);
 const meta=JSON.parse(read('.local/crm-speed-20261111/esbuild-meta.json'));const viewer=Object.entries(meta.outputs).find(([,v])=>Object.keys(v.inputs).some(n=>n.endsWith('home-hero/layout-viewer.mjs')));assert.ok(viewer);assert.ok(Object.values(meta.outputs).some(v=>v.imports.some(i=>i.path===viewer[0]&&i.kind==='dynamic-import')));
});
