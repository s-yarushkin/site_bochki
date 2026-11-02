import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const BASE='http://127.0.0.1:4187/novyy-god/';
const OUT='output/new-year-r4-browser';
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
const sizes=[
 {name:'desktop1649',width:1649,height:927,columns:2,expectedWidth:1280,canFit:true},
 {name:'desktop1440',width:1440,height:900,columns:2,expectedWidth:1280,canFit:true},
 {name:'laptop1280',width:1280,height:720,columns:2,expectedWidth:1232,canFit:true},
 {name:'laptop1024',width:1024,height:768,columns:2,expectedWidth:976,canFit:true},
 {name:'tablet820',width:820,height:800,columns:1,expectedWidth:650,canFit:false},
 {name:'mobile390',width:390,height:844,columns:1,expectedWidth:374,canFit:false},
 {name:'mobile320',width:320,height:690,columns:1,expectedWidth:304,canFit:false},
];
try{
 for(const c of sizes){
  const page=await browser.newPage({viewport:{width:c.width,height:c.height},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(BASE,{waitUntil:'networkidle'});
  if(!response?.ok())throw Error(c.name+' navigation '+response?.status());
  if(await page.locator('.delivery-geography').count()!==0)
    throw Error(c.name+' oversized shipping block still shown');
  const footer=page.locator('footer .delivery-footer-line');
  const footerText=await footer.innerText();
  if(!footerText.includes('Доставка: Москва и Подмосковье, Петербург и Ленобласть, Вологодская и Ярославская области.'))
    throw Error(c.name+' footer regional text mismatch: '+footerText);
  for(const forbidden of ['Сергиев Посад','Ногинск','Ивантеевка','Королёв','Мытищи','Софрино','Основные направления:'])
    if((await page.locator('footer').innerText()).includes(forbidden))
      throw Error(c.name+' unexpected city/phrase: '+forbidden);
  const footerStyle=await footer.evaluate(el=>({
    px:parseFloat(getComputedStyle(el).fontSize),
    width:el.getBoundingClientRect().width,
    scrollWidth:document.documentElement.scrollWidth
  }));
  if(footerStyle.px>12||footerStyle.scrollWidth>c.width+2)
    throw Error(c.name+' footer too big or horizontal overflow '+JSON.stringify(footerStyle));
  if(c.name==='desktop1440'||c.name==='mobile390'){
    await footer.scrollIntoViewIfNeeded();
    await page.screenshot({path:OUT+'/'+c.name+'-footer.png'});
  }
  await page.locator('.header [data-open-lead]').click();
  await page.locator('#lead-dialog[open]').waitFor();
  const measured=await page.evaluate(()=>{
    const dialog=document.querySelector('#lead-dialog');
    const rect=dialog.getBoundingClientRect(),story=dialog.querySelector('.dialog-story').getBoundingClientRect(),
      action=dialog.querySelector('.dialog-action').getBoundingClientRect(),
      title=dialog.querySelector('h2'),cta=dialog.querySelector('#submit-lead'),button=cta.getBoundingClientRect();
    return {
      width:rect.width,height:rect.height,top:rect.top,bottom:rect.bottom,
      scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight,
      documentScroll:document.documentElement.scrollWidth,
      heading:title.textContent,headingPx:parseFloat(getComputedStyle(title).fontSize),
      buttonPx:parseFloat(getComputedStyle(cta).fontSize),
      buttonHeight:button.height,buttonTop:button.top,buttonBottom:button.bottom,
      storyLeft:story.left,storyRight:story.right,actionLeft:action.left,actionTop:action.top,
      phoneVisible:!!dialog.querySelector('#phone'),formEnabled:!dialog.querySelector('fieldset').disabled
    }
  });
  if(Math.abs(measured.width-c.expectedWidth)>2)
   throw Error(c.name+' wrong modal width '+JSON.stringify(measured));
  if(c.columns===2){
   if(measured.actionLeft<measured.storyRight-2||measured.actionTop>measured.top+2)
    throw Error(c.name+' two-column layout missing '+JSON.stringify(measured));
   if(measured.headingPx>34||measured.buttonPx<20||measured.buttonHeight<74)
    throw Error(c.name+' too much emphasis on heading or small CTA '+JSON.stringify(measured));
   if(measured.buttonTop<0||measured.buttonBottom>c.height-12||
      measured.scrollHeight>measured.clientHeight+2)
    throw Error(c.name+' form cannot fit viewport without scrolling '+JSON.stringify(measured));
  }else{
   if(measured.actionTop<measured.top+100||measured.buttonPx<17)
    throw Error(c.name+' stacked mobile form broken '+JSON.stringify(measured));
  }
  if(measured.documentScroll>c.width+2)throw Error(c.name+' page overflows horizontally');
  if(measured.heading!=='Пришлём подходящие варианты, цены и комплектации')
   throw Error(c.name+' heading mismatch');
  if(!measured.formEnabled)throw Error(c.name+' lead form unavailable');
  await page.locator('#lead-dialog').screenshot({path:OUT+'/'+c.name+'-dialog.png'});
  if(c.name==='desktop1440'){
    await page.locator('.form-details summary').click();
    await page.locator('#settlement').fill('Переславль-Залесский');
    await page.locator('#comment').fill('Подобрать подходящую баню');
    await page.locator('#phone').fill('+7 (999) 123-45-67');
    await page.locator('#lead-dialog').screenshot({path:OUT+'/'+c.name+'-expanded.png'});
    if(!await page.locator('#submit-lead').isVisible())throw Error('Expanded form submit unreachable');
  }
  await page.keyboard.press('Escape');
  if(await page.locator('#lead-dialog[open]').count())throw Error(c.name+' Escape close broken');
  if(errors.length)throw Error(c.name+' JS runtime errors '+errors.join('; '));
  console.log('NY2027_R4_BROWSER_SCENE=PASS',c.name,JSON.stringify({
    dialogWidth:measured.width,dialogHeight:measured.height,dialogScroll:measured.scrollHeight-measured.clientHeight,
    titlePx:measured.headingPx,ctaPx:measured.buttonPx,ctaHeight:measured.buttonHeight
  }));
  await page.close();
 }
 console.log('NY2027_R4_BROWSER=PASS');
}catch(e){console.error('NY2027_R4_BROWSER=FAIL',e.message);process.exitCode=1}
finally{await browser.close()}
