/** Text-only acceptance: real CSS and content-page module, no external pixels/POST. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.R732_PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
const out='artifacts/r732-browser';
fs.mkdirSync(out,{recursive:true});
const routes=['/','/bani/','/bani/kvadro/','/bani/parus/','/bani/viking/','/bani/kvadro-haus/','/compare/','/voprosy/','/kontakty/','/dostavka-i-ustanovka/','/journal/','/journal/iz-chego-skladyvaetsya-tsena/','/journal/kvadro-5-komfort/','/journal/dostavka-i-osnovanie/','/journal/banya-4-5-6-metrov/','/journal/kak-chitat-komplektatsiyu-bani/','/journal/kak-prinyat-gotovuyu-banyu/'];
const newRoutes=new Set(routes.slice(-3));
const evidence=[];let forbidden=0;
const browser=await chromium.launch({headless:true});
try{
  for(const width of [360,390,768,1366]){
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
    await context.route('**/*',async route=>{
      const request=route.request();const url=new URL(request.url());
      if(request.method()!=='GET'){forbidden++;return route.abort();}
      if(url.origin!==base)return route.abort();
      if(url.pathname.endsWith('/analytics-runtime.mjs'))return route.fulfill({contentType:'text/javascript',body:'export const analytics={start(){},track(){},confirmed(){}};'});
      // Preserve real content-page behaviour. Application/animation modules are
      // unchanged and independently protected; this check does not send leads.
      if(request.resourceType()==='script'&&!url.pathname.endsWith('/content-page.mjs'))return route.fulfill({contentType:'text/javascript',body:''});
      if(['image','font','media'].includes(request.resourceType()))return route.abort();
      return route.continue();
    });
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    for(const route of routes){
      const before=[];
      for(const phase of newRoutes.has(route)?['after']:['before','after']){
        const url=base+(phase==='before'?'/__before__':'')+route;
        const response=await page.goto(url,{waitUntil:'networkidle',timeout:60000});
        assert.equal(response.status(),200,url);
        const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,h1:document.querySelectorAll('h1').length,css:[...document.styleSheets].filter(s=>s.href).length}));
        assert.equal(metrics.h1,1,url);assert.ok(metrics.css>=3,url+' CSS missing');
        if(phase==='before')before.push(metrics);
        else{
          assert.ok(metrics.overflow<=1,JSON.stringify({route,width,phase,metrics,before}));
          if(width===390||width===1366)await page.screenshot({path:path.join(out,(route==='/'?'home':route.replaceAll('/','_'))+'-'+width+'.png'),fullPage:true});
          evidence.push({route,width,...metrics});
          if(route==='/voprosy/'){
            assert.equal(await page.locator('details').count(),14);
            await page.locator('details summary').first().click();
            assert.equal(await page.locator('details').first().evaluate(el=>el.open),true);
          }
          if(newRoutes.has(route)){
            await page.locator('.article-sidebar a').last().click();
            assert.equal(new URL(page.url()).hash,'#part-5');
            assert.equal(await page.locator('main img').count(),0);
          }
        }
      }
    }
    await page.goto(base+'/bani/kvadro/?size=500',{waitUntil:'networkidle'});
    assert.equal(await page.locator('tr[data-size="500"]').evaluate(el=>el.classList.contains('is-selected')),true);
    const chosen=await page.locator('tr[data-size="500"] a').getAttribute('href');
    const parsed=new URL(chosen,page.url());assert.equal(parsed.searchParams.get('model'),'kvadro');assert.equal(parsed.searchParams.get('size'),'500');assert.equal(parsed.hash,'#configure');
    await page.goto(base+'/journal/',{waitUntil:'networkidle'});
    await page.locator('button[data-filter="Выбор бани"]').click();
    assert.equal(await page.locator('#journal-index [data-category="Выбор бани"]:visible').count(),5);
    assert.equal(await page.locator('#journal-index [data-category="Материалы"]:visible').count(),0);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  assert.equal(forbidden,0);
  fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({status:'PASS',cases:evidence.length,viewports:4,forbiddenRequests:forbidden,evidence},null,2));
  console.log('R732_BROWSER=PASS; CASES='+evidence.length+'; VIEWPORTS=4; FAQ=14; SIZE_LINK=PASS; JOURNAL_FILTER=PASS; OVERFLOW=0; POST=0; ANALYTICS=STUBBED');
}finally{await browser.close();}
