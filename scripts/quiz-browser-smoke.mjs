import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const BASE=process.env.QUIZ_TEST_ORIGIN||'http://127.0.0.1:8765';
const OUT=process.env.QUIZ_SHOTS_DIR||'output/quiz-browser';
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
let problems=[];
const selectors={dialog:'#dp-quiz-dialog',result:'.dp-quiz-results',phone:'#dp-quiz-phone'};
async function test(viewport,label,party='p4',wash='w_compare',bedroom='b_no',channel='max'){
 const page=await browser.newPage({viewport,deviceScaleFactor:1});
 const errors=[];let sent=null;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/site-settings.json',async route=>{
   const response=await route.fetch(),data=await response.json();
   data.lead.allowedOrigins=[BASE];
   await route.fulfill({response,json:data});
 });
 await page.route('**/api/lead',async route=>{
   sent=route.request().postDataJSON();
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,delivered:true,analytics:{persisted:true,premiumQualified:false,detailedQualified:false}})});
 });
 const response=await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
 if(!response?.ok())throw new Error(label+' index load '+response?.status());
 await page.waitForSelector('#dp-quiz-open',{timeout:12000});
 await page.locator('#dp-quiz-open').click();
 await page.waitForSelector('#dp-quiz-dialog[open]');
 await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+label+'-step1.png'});
 const quizPhotos=['step1-steamroom.webp','step2-washroom.webp','step3-bedroom.webp'];
 for(const [step,value] of [party,wash,bedroom].entries()){
   const photo=page.locator('.dp-quiz-photo img');
   await photo.waitFor({state:'visible'});
   const src=await photo.getAttribute('src');
   if(src!=='/assets/quiz/'+quizPhotos[step])throw new Error(label+' wrong quiz photo at step '+(step+1)+': '+src);
   const decoded=await photo.evaluate(async img=>{
     try {await img.decode();return img.naturalWidth>0&&img.naturalHeight>0;} catch{return false;}
   });
   if(!decoded)throw new Error(label+' image failed to load at step '+(step+1)+': '+src);
   await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+label+'-step'+(step+1)+'.png'});
   const button=page.locator('#dp-quiz-dialog [data-dpq="answer"][data-value="'+value+'"]');
   await button.click();
 }
 await page.waitForSelector(selectors.result,{timeout:5000});
 const cards=await page.locator('.dp-quiz-plan').count();
 const prices=await page.locator('.dp-quiz-plan-price').allTextContents();
 if(prices.some(x=>/\d{6} ₽/.test(x)))throw new Error(label+' price is not grouped into thousands: '+prices.join(' | '));
 const cta=page.locator('.dp-quiz-cta-primary');
 const ctaBox=await cta.boundingBox();
 if(!ctaBox||ctaBox.width<Math.min(viewport.width*.42,320)||ctaBox.height<(viewport.width>760?78:58))
   throw new Error(label+' CTA too small '+JSON.stringify(ctaBox));
 if(ctaBox.y<0||ctaBox.y+ctaBox.height>viewport.height+1)
   throw new Error(label+' CTA hidden outside viewport '+JSON.stringify(ctaBox));
 const ctaText=await cta.innerText();
 if(!ctaText.includes('Получить планировки и комплектации с ценами')||!ctaText.includes('скидку 20 000 ₽ на «Делюкс»'))
   throw new Error(label+' explicit plans and conditional bonus missing from CTA: '+ctaText);
 if(ctaText.includes('Получить предложение')||ctaText.includes('20%'))
   throw new Error(label+' CTA still promises a generic offer or unapproved percentage discount');
 if(!(await page.locator('.dp-quiz-price-note').innerText()).includes('Окончательная цена зависит от комплектации и планировки.'))
   throw new Error(label+' caveat not rewritten');
 if(await page.locator('.dp-quiz-plan a,.dp-quiz-layout-preview,.dp-quiz-layout-all').count())
   throw new Error(label+' quiz model cards must not navigate or open layouts');
 if(!(await page.locator('.dp-quiz-cta-copy').innerText()).includes('Подходящие варианты уже найдены'))
   throw new Error(label+' missing concise results CTA context');

 if(cards<1||cards>4)throw new Error(label+' wrong results count: '+cards);
 if(await page.locator(selectors.phone).count())throw new Error(label+' phone shown before result CTA');
 await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+label+'-result.png'});
 if(await page.locator('#dp-quiz-dialog [data-dpq="form"]').count()!==1)throw new Error(label+' repeated contact CTA');
 if(await page.locator('#dp-quiz-dialog [data-dpq="detail"]').count())throw new Error(label+' obsolete floor-plan action');
 if(await page.locator('.dp-quiz-plan-thumb').count())throw new Error(label+' obsolete floor-plan image');
 await page.locator('[data-dpq="form"]').click();
 await page.waitForSelector(selectors.phone);
 if(!(await page.locator('#dp-quiz-title').innerText()).includes('Куда прислать планировки, комплектации и цены?'))throw new Error(label+' plan delivery contact heading missing');
 const options=await page.locator('#dp-quiz-contact-form input[name="channel"]').count();
 if(options!==3)throw new Error(label+' expected MAX WhatsApp Telegram');
 await page.locator('#dp-quiz-contact-form input[name="channel"][value="'+channel+'"]').check();
 await page.locator(selectors.phone).fill('9991234567');
 await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+label+'-form.png'});
 const dimensions=await page.evaluate(()=>{
   const root=document.querySelector('#dp-quiz-dialog'),frame=root.querySelector('.dp-quiz-frame'),main=root.querySelector('.dp-quiz-main');
   return {vw:innerWidth,dialogWidth:root.getBoundingClientRect().width,frameScrollWidth:frame.scrollWidth,frameClientWidth:frame.clientWidth,mainScrollWidth:main.scrollWidth,mainClientWidth:main.clientWidth};
 });
 if(dimensions.dialogWidth>viewport.width+1)throw new Error(label+' dialog too wide '+JSON.stringify(dimensions));
 if(dimensions.mainScrollWidth>dimensions.mainClientWidth+8)throw new Error(label+' horizontal quiz overflow '+JSON.stringify(dimensions));
 await page.locator('#dp-quiz-contact-form [type="submit"]').click();
 try{await page.waitForSelector('.dp-quiz-good',{timeout:7000});}catch(e){const details=await page.evaluate(()=>({errors:[...document.querySelectorAll('.dp-quiz-error')].map(x=>x.textContent),visibleTitle:document.querySelector('#dp-quiz-title')?.textContent,channel:document.querySelector('input[name="channel"]:checked')?.value,phone:document.querySelector('#dp-quiz-phone')?.value}));throw new Error(label+' form failure '+JSON.stringify({details,requestSent:!!sent})+' '+e.message)}
 if(!sent)throw new Error(label+' no lead request');
 if(sent.purpose!=='quiz_catalog'||sent.flow!=='callback'||sent.contactChannel!==channel)throw new Error(label+' wrong channel payload '+JSON.stringify({purpose:sent.purpose,flow:sent.flow,contactChannel:sent.contactChannel}));
 if(!sent.comment?.includes('DP-PL-'))throw new Error(label+' layout codes missing');
 await page.keyboard.press('Escape');
 if(await page.locator('#dp-quiz-dialog[open]').count())throw new Error(label+' Escape failed');
 if(errors.length)throw new Error(label+' JS errors: '+errors.join('; '));
 await page.close();
 return {label,cards,channel,dimensions};
}
async function insertYourBathVision(page){
 await page.evaluate(()=>{
   if(document.querySelector('#quiz-vision-ci'))return;
   const section=document.createElement('section');
   section.id='quiz-vision-ci';
   section.style.cssText='display:block;min-height:105vh;padding:100px 40px;box-sizing:border-box;background:#ebe9dc;';
   section.innerHTML='<h2>ВАША БАНЯ</h2><h3>Расскажите, какой вы её представляете</h3><p>Тихие вечера вдвоём</p>';
   document.querySelector('footer').before(section);
 });
}
async function invitePolicySmoke(viewport,label,scenario){
 const page=await browser.newPage({viewport,deviceScaleFactor:1});
 try{
   // The R101 exterior photo exists in the deployed site's immutable assets, not in the raw /web test fixture.
   await page.route('**/r101/assets/parus-editorial-960.webp',route=>route.fulfill({path:'web/assets/quiz/step1-steamroom.webp',contentType:'image/webp'}));
   await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
   await page.waitForSelector('#dp-quiz-open',{timeout:12000});
   if(await page.locator('.dp-quiz-invite[open]').count())throw new Error(label+' invite appeared at landing');
   if(scenario==='your-bath')await insertYourBathVision(page);
   await page.evaluate(target=>{
     const section=document.querySelector(target);
     if(!section)throw new Error('Missing target section '+target);
     window.scrollTo({top:window.scrollY+section.getBoundingClientRect().top+120,behavior:'instant'});
   },scenario==='models-idle'?'#models':'#quiz-vision-ci');
   if(scenario==='models-idle'){
     await page.waitForTimeout(600);
     if(await page.locator('.dp-quiz-invite[open]').count())throw new Error(label+' invite appeared without idle time');
     // Moving the mouse in the models grid resets the idle countdown.
     await page.mouse.move(132,156);
     await page.locator('.dp-quiz-invite[open]').waitFor({state:'visible',timeout:23000});
   }else{
     await page.locator('.dp-quiz-invite[open]').waitFor({state:'visible',timeout:5000});
   }
   if(await page.locator('#dp-quiz-dialog[open]').count())throw new Error(label+' automatic invite opened quiz without click');
   const bounds=await page.evaluate(async()=>{
     const dialog=document.querySelector('.dp-quiz-invite'),visual=dialog.querySelector('.dp-quiz-invite-visual');
     const photo=dialog.querySelector('.dp-quiz-invite-photo'),button=dialog.querySelector('[data-dpq-open]');
     try{await photo.decode()}catch{}
     const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
     return {dialog:rect(dialog),visual:rect(visual),photo:rect(photo),button:rect(button),
       naturalWidth:photo.naturalWidth,naturalHeight:photo.naturalHeight,fit:getComputedStyle(photo).objectFit,
       scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth};
   });
   const {dialog,visual,photo,button}=bounds;
   if(bounds.naturalWidth<300||bounds.naturalHeight<200)throw new Error(label+' invite photo did not load '+JSON.stringify(bounds));
   if(bounds.fit!=='cover'||Math.abs(photo.width-visual.width)>2||Math.abs(photo.height-visual.height)>2)
     throw new Error(label+' photo reduced to strip instead of filling panel '+JSON.stringify(bounds));
   if(dialog.width>viewport.width+1||dialog.x<0||dialog.x+dialog.width>viewport.width+1)
     throw new Error(label+' invite overflows viewport '+JSON.stringify(bounds));
   if(bounds.scrollWidth>bounds.clientWidth+2)throw new Error(label+' horizontal invite overflow '+JSON.stringify(bounds));
   if(viewport.width>760){
     const dx=Math.abs(dialog.x+dialog.width/2-viewport.width/2),dy=Math.abs(dialog.y+dialog.height/2-viewport.height/2);
     if(dx>40||dy>40||dialog.width<780||visual.width<320||visual.height<420)
       throw new Error(label+' image panel not balanced and centered '+JSON.stringify(bounds));
   }else if(visual.width<dialog.width-4||visual.height<120){
     throw new Error(label+' mobile hero image missing '+JSON.stringify(bounds));
   }
   if(button.width<180||button.height<48)throw new Error(label+' primary button too small '+JSON.stringify(bounds));
   const heading=await page.locator('#dp-quiz-invite-title').textContent();
   if(!heading?.includes('Какая баня подойдёт вам?'))throw new Error(label+' invitation headline drift');
   if(await page.locator('.dp-quiz-invite-reassurance').count()!==0)
     throw new Error(label+' outdated promise without phone still visible');
   await page.locator('.dp-quiz-invite').screenshot({path:OUT+'/invite-'+label+'.png'});
   await page.locator('[data-dpq-open]').click();
   await page.waitForSelector('#dp-quiz-dialog[open]');
   await page.keyboard.press('Escape');
   if(await page.locator('#dp-quiz-dialog[open]').count())throw new Error(label+' quiz Escape failed');
   // After the first invitation, the other hotspot must never repeat it.
   await insertYourBathVision(page);
   await page.evaluate(()=>document.querySelector('#quiz-vision-ci').scrollIntoView({block:'start',behavior:'instant'}));
   await page.waitForTimeout(300);
   if(await page.locator('.dp-quiz-invite[open]').count())throw new Error(label+' invite repeated after first display');
   return {scenario:'invite-'+label,trigger:scenario,photoFillsPanel:true,bounds};
 }finally{await page.close()}
}
async function visionScreenSmoke(viewport,label){
 const page=await browser.newPage({viewport});
 try{
  await page.addInitScript(()=>{
   sessionStorage.removeItem('dp_quiz_invite_seen_session_r111');
   sessionStorage.setItem('dp_quiz_answers_v1',JSON.stringify({party:'p4',wash:'w_no',bedroom:'b_no'}));
   localStorage.setItem('dp_quiz_invite_suppressed_until_v1',String(Date.now()+86400000));
  });
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#dp-quiz-open',{timeout:12000});
  const position=await page.evaluate(()=>{
    const launcher=document.querySelector('#dp-quiz-open');
    const footer=document.querySelector('footer');
    return {footerOnly:footer.contains(launcher),inline:!!document.querySelector('main .dp-quiz-entry')};
  });
  if(!position.footerOnly||position.inline)throw new Error(label+' static CTA placement '+JSON.stringify(position));
  // No quiz when viewing the unrelated calculator or at the actual footer.
  await page.evaluate(()=>document.querySelector('#configure').scrollIntoView({block:'start',behavior:'instant'}));
  await page.waitForTimeout(500);
  if(await page.locator('.dp-quiz-invite[open]').count())throw new Error(label+' appeared prematurely at calculator');
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  await page.waitForTimeout(500);
  if(await page.locator('.dp-quiz-invite[open]').count())throw new Error(label+' appeared prematurely at footer');
  await insertYourBathVision(page);
  await page.evaluate(()=>document.querySelector('#quiz-vision-ci').scrollIntoView({block:'start',behavior:'instant'}));
  try{await page.locator('.dp-quiz-invite[open]').waitFor({state:'visible',timeout:6500});}
  catch(error){
    const d=await page.evaluate(()=>{
      const section=document.querySelector('#quiz-vision-ci'),r=section?.getBoundingClientRect();
      const title=section?.querySelector('h2'),tr=title?.getBoundingClientRect();
      return {scrollY,innerHeight,sectionRect:r?{top:r.top,bottom:r.bottom,height:r.height}:null,
        titleText:title?.textContent,titleRect:tr?{top:tr.top,bottom:tr.bottom}:null,
        visibility:document.visibilityState,
        sessionSeen:sessionStorage.getItem('dp_quiz_invite_seen_session_r111'),
        allDialogs:[...document.querySelectorAll('dialog')].map(x=>({id:x.id,cls:x.className,open:x.open})),
        footerTop:document.querySelector('footer')?.getBoundingClientRect().top,
        candidates:[...document.querySelectorAll('h1,h2,h3')].filter(e=>(e.textContent||'').toLowerCase().includes('ваша баня')).map(x=>({text:x.textContent,rects:x.getClientRects().length}))};
    });
    throw new Error(label+' VISION_DIAG '+JSON.stringify(d)+' '+error.message);
  }
  await page.locator('[data-dpq-hide]').click();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.evaluate(()=>document.querySelector('#quiz-vision-ci').scrollIntoView({block:'start',behavior:'instant'}));
  await page.waitForTimeout(300);
  if(await page.locator('.dp-quiz-invite[open]').count())throw new Error(label+' appeared a second time');
  return {scenario:label,triggerOnlyAtVision:true,oneTime:true,footerOnly:true};
 }finally{await page.close()}
}
async function aestheticBlockSmoke(){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#dp-quiz-open',{timeout:12000});
  await page.evaluate(()=>document.querySelector('#details').scrollIntoView({block:'start',behavior:'instant'}));
  await page.waitForTimeout(750);
  if(await page.locator('.dp-quiz-invite[open]').count())throw new Error('Ritual interrupted');
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  await page.waitForTimeout(550);
  if(await page.locator('.dp-quiz-invite[open]').count())throw new Error('Footer triggered unsolicited popup');
  await insertYourBathVision(page);
  await page.evaluate(()=>document.querySelector('#quiz-vision-ci').scrollIntoView({block:'start',behavior:'instant'}));
  await page.locator('.dp-quiz-invite[open]').waitFor({state:'visible',timeout:6500});
  return {scenario:'ritual-then-vision',ritualClean:true,footerClean:true,visionPopup:true};
 }finally{await page.close()}
}
async function anchorNavigationSmoke(){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
  await page.route('**/r101/assets/parus-editorial-960.webp',route=>route.fulfill({path:'web/assets/quiz/step1-steamroom.webp',contentType:'image/webp'}));
  await page.goto(BASE+'/#configure',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#dp-quiz-open',{timeout:12000});
  await page.waitForTimeout(450);
  if(await page.locator('.dp-quiz-invite[open]').count())throw new Error('Calculator URL is not the desired vision screen');
  await insertYourBathVision(page);
  await page.evaluate(()=>{location.hash='#quiz-vision-ci'});
  await page.locator('.dp-quiz-invite[open]').waitFor({state:'visible',timeout:6500});
  await page.locator('[data-dpq-hide]').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#dp-quiz-open',{timeout:12000});
  await page.waitForTimeout(600);
  if(await page.locator('.dp-quiz-invite[open]').count())throw new Error('Invite repeated after dismissal');
  return {scenario:'anchor-to-vision-only',shownOnce:true};
 }finally{await page.close()}
}
async function clickedModelNavigationSmoke(){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#dp-quiz-open',{timeout:12000});
  await page.evaluate(()=>localStorage.setItem('dp_r101_choice',JSON.stringify({model:'kvadro'})));
  await insertYourBathVision(page);
  await page.evaluate(()=>document.querySelector('#quiz-vision-ci').scrollIntoView({block:'start',behavior:'instant'}));
  await page.locator('.dp-quiz-invite[open]').waitFor({state:'visible',timeout:6500});
  return {scenario:'chosen-model-then-vision',shownOnce:true};
 }finally{await page.close()}
}
const runCase=async(name,fn)=>{
 console.log('QUIZ_SCENARIO_START',name);
 const outcome=await fn();
 console.log('QUIZ_SCENARIO_PASS',name);
 return outcome;
};
try{
 const results=[];
 results.push(await runCase('desktop-vision',()=>visionScreenSmoke({width:1440,height:900},'desktop-vision')));
 results.push(await runCase('mobile-vision',()=>visionScreenSmoke({width:390,height:844},'mobile-vision')));
 results.push(await runCase('aesthetic',()=>aestheticBlockSmoke()));
 results.push(await runCase('anchor',()=>anchorNavigationSmoke()));
 results.push(await runCase('model',()=>clickedModelNavigationSmoke()));
 results.push(await invitePolicySmoke({width:1440,height:900},'desktop-idle','models-idle'));
 results.push(await invitePolicySmoke({width:390,height:844},'mobile-configure','your-bath'));
 results.push(await test({width:1440,height:900},'desktop','p4','w_compare','b_no','max'));
 results.push(await test({width:390,height:844},'mobile390','p4','w_compare','b_no','whatsapp'));
 results.push(await test({width:320,height:690},'mobile320','p2','w_no','b_no','telegram'));
 // The conflict requires honest disclosure rather than a false zero-result screen.
 results.push(await test({width:390,height:844},'bedroom-compromise','p8','w_no','b_yes','max'));
 console.log('QUIZ_BROWSER=PASS',JSON.stringify(results));
}catch(e){problems.push(e.message);console.error('QUIZ_BROWSER=FAIL',e.message);process.exitCode=1}
finally{await browser.close()}
