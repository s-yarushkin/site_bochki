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
 if(!(await cta.innerText()).includes('со скидкой 20 000 ₽'))
   throw new Error(label+' prominent discount CTA missing');
 if(!(await page.locator('.dp-quiz-price-note').innerText()).includes('Окончательная цена зависит от комплектации и планировки.'))
   throw new Error(label+' caveat not rewritten');
 if(await page.locator('.dp-quiz-plan a,.dp-quiz-layout-preview,.dp-quiz-layout-all').count())
   throw new Error(label+' quiz model cards must not navigate or open layouts');
 if(!(await page.locator('.dp-quiz-cta-copy').innerText()).includes('планировки, комплектации и цены'))
   throw new Error(label+' missing promise to send suitable plans');

 if(cards<1||cards>4)throw new Error(label+' wrong results count: '+cards);
 if(await page.locator(selectors.phone).count())throw new Error(label+' phone shown before result CTA');
 await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+label+'-result.png'});
 if(await page.locator('#dp-quiz-dialog [data-dpq="form"]').count()!==1)throw new Error(label+' repeated contact CTA');
 if(await page.locator('#dp-quiz-dialog [data-dpq="detail"]').count())throw new Error(label+' obsolete floor-plan action');
 if(await page.locator('.dp-quiz-plan-thumb').count())throw new Error(label+' obsolete floor-plan image');
 await page.locator('[data-dpq="form"]').click();
 await page.waitForSelector(selectors.phone);
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
async function invitePolicySmoke(viewport,label,scenario){
 const page=await browser.newPage({viewport,deviceScaleFactor:1});
 try{
   // The R101 exterior photo exists in the deployed site's immutable assets, not in the raw /web test fixture.
   await page.route('**/r101/assets/parus-editorial-960.webp',route=>route.fulfill({path:'web/assets/quiz/step1-steamroom.webp',contentType:'image/webp'}));
   await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
   await page.waitForSelector('#dp-quiz-open',{timeout:12000});
   if(await page.locator('.dp-quiz-invite[open]').count())throw new Error(label+' invite appeared at landing');
   await page.evaluate(target=>{
     const section=document.querySelector(target);
     if(!section)throw new Error('Missing target section '+target);
     window.scrollTo({top:window.scrollY+section.getBoundingClientRect().top+120,behavior:'instant'});
   },scenario==='models-idle'?'#models':'#configure');
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
   // After the first invitation, scrolling to either hotspot must not show it again.
   await page.evaluate(()=>document.querySelector('#configure').scrollIntoView({block:'start',behavior:'instant'}));
   await page.waitForTimeout(300);
   if(await page.locator('.dp-quiz-invite[open]').count())throw new Error(label+' invite repeated after first display');
   return {scenario:'invite-'+label,trigger:scenario,photoFillsPanel:true,bounds};
 }finally{await page.close()}
}
async function aestheticBlockSmoke(){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
   await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
   await page.waitForSelector('#dp-quiz-open',{timeout:12000});
   // Jump directly past both hotspots. The stones/broom/bench scene
   // must never have its own page-percentage or exit-intent trigger.
   await page.evaluate(()=>{const r=document.querySelector('#details').getBoundingClientRect();window.scrollTo({top:window.scrollY+r.top+40,behavior:'instant'})});
   await page.waitForTimeout(1500);
   if(await page.locator('.dp-quiz-invite[open]').count())throw new Error('Aesthetic block interrupted by quiz');
   return {scenario:'aesthetic-block',popup:false};
 }finally{await page.close()}
}
try{
 const results=[];
 results.push(await aestheticBlockSmoke());
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
