import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const BASE='http://127.0.0.1:4187/novyy-god/';
const OUT='output/new-year-r2-browser';
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
const testCases=[
  {name:'desktop1440',width:1440,height:900,minModal:630,minTitle:39,minRegionColumns:2},
  {name:'mobile390',width:390,height:844,minModal:360,minTitle:26,minRegionColumns:1},
  {name:'mobile320',width:320,height:690,minModal:290,minTitle:26,minRegionColumns:1},
];
try{
  for(const size of testCases){
    const page=await browser.newPage({viewport:{width:size.width,height:size.height},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    const resp=await page.goto(BASE,{waitUntil:'networkidle'});
    if(!resp?.ok())throw new Error(size.name+' page load: '+resp?.status());
    const section=page.locator('.delivery-geography');
    const headings=await section.locator('.delivery-regions li').allTextContents();
    const expected=['Москва и Московская область','Ярославская область','Вологодская область','Ленинградская область'];
    if(JSON.stringify(headings)!==JSON.stringify(expected))throw new Error(size.name+' incomplete shipping regions '+JSON.stringify(headings));
    await section.scrollIntoViewIfNeeded();
    const region=await page.evaluate(()=>{
      const el=document.querySelector('.delivery-geography');
      const cards=[...el.querySelectorAll('li')].map(x=>x.getBoundingClientRect());
      return {w:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        y:el.getBoundingClientRect().top,columns:cards[0]?.top===cards[1]?.top?2:1,
        afterHero:el.compareDocumentPosition(document.querySelector('.hero'))&Node.DOCUMENT_POSITION_PRECEDING};
    });
    if(!region.afterHero||region.scrollWidth>size.width+2||region.columns!==size.minRegionColumns)
      throw new Error(size.name+' geography layout '+JSON.stringify(region));
    await page.screenshot({path:OUT+'/'+size.name+'-geography.png'});
    await page.locator('.header [data-open-lead]').click();
    await page.locator('#lead-dialog[open]').waitFor({timeout:8000});
    const modal=await page.evaluate(()=>{
      const d=document.querySelector('#lead-dialog'),title=d.querySelector('#form-heading');
      const description=d.querySelector('#form-description');
      const phone=d.querySelector('#phone'),cta=d.querySelector('#submit-lead');
      const bounds=d.getBoundingClientRect();
      return {width:bounds.width,viewport:innerWidth,
        dialogScrollWidth:d.scrollWidth,dialogClientWidth:d.clientWidth,
        title:title.textContent,headingSize:parseFloat(getComputedStyle(title).fontSize),
        descSize:parseFloat(getComputedStyle(description).fontSize),
        phoneSize:parseFloat(getComputedStyle(phone).fontSize),
        ctaSize:parseFloat(getComputedStyle(cta).fontSize),
        phonePresent:!!phone,ctaPresent:!!cta};
    });
    if(modal.width<size.minModal||modal.width>size.width||modal.headingSize<size.minTitle||
       modal.descSize<(size.width<701?14:15)||modal.phoneSize<16||modal.ctaSize<17||
       modal.dialogScrollWidth>modal.dialogClientWidth+2||
       modal.title!=='Пришлём подходящие варианты, цены и комплектации')
       throw new Error(size.name+' modal visual '+JSON.stringify(modal));
    await page.locator('#lead-dialog').screenshot({path:OUT+'/'+size.name+'-dialog.png'});
    if(errors.length)throw new Error(size.name+' JS errors '+errors.join('; '));
    console.log('NY2027_R2_BROWSER_SCENE=PASS',size.name,JSON.stringify({modalWidth:modal.width,headingPx:modal.headingSize,regions:headings.length,columns:region.columns}));
    await page.close();
  }
  console.log('NY2027_R2_BROWSER=PASS');
}catch(error){console.error('NY2027_R2_BROWSER=FAIL',error.message);process.exitCode=1}
finally{await browser.close()}
