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
 for(const value of [party,wash,bedroom]){
   const button=page.locator('#dp-quiz-dialog [data-dpq="answer"][data-value="'+value+'"]');
   await button.click();
 }
 await page.waitForSelector(selectors.result,{timeout:5000});
 const cards=await page.locator('.dp-quiz-plan').count();
 const prices=await page.locator('.dp-quiz-plan-price').allTextContents();
 if(prices.some(x=>/\d{6} ₽/.test(x)))throw new Error(label+' price is not grouped into thousands: '+prices.join(' | '));
 if(await page.locator('.dp-quiz-bonus').count()!==1)throw new Error(label+' Deluxe bonus missing or duplicated');

 if(cards<1||cards>3)throw new Error(label+' wrong results count: '+cards);
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
async function invitePolicySmoke(){
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 try{
   await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
   await page.waitForSelector('#dp-quiz-open',{timeout:12000});
   const ratio=await page.evaluate(()=>{
     const h=document.documentElement.scrollHeight-innerHeight;
     if(h<=0)throw new Error('No page scroll for invite test');
     window.scrollTo({top:Math.ceil(h*0.38),behavior:'instant'});
     return scrollY/h;
   });
   if(ratio<0.35)throw new Error('Invite smoke did not scroll far enough: '+ratio);
   if(await page.locator('.dp-quiz-invite').isVisible())throw new Error('Invite appeared before 10 seconds');
   await page.locator('.dp-quiz-invite:not([hidden])').waitFor({state:'visible',timeout:13500});
   if(await page.locator('#dp-quiz-dialog[open]').count())throw new Error('Automatic invite opened modal without click');
   const box=await page.locator('.dp-quiz-invite[open]').boundingBox();
   if(!box)throw new Error('Centered invite dialog did not open');
   const dx=Math.abs(box.x+box.width/2-720),dy=Math.abs(box.y+box.height/2-450);
   if(dx>40||dy>40||box.width<480)throw new Error('Invite not a large centered popup '+JSON.stringify({box,dx,dy}));
   const heading=await page.locator('#dp-quiz-invite-title').textContent();
   if(!heading?.includes('за 3 шага'))throw new Error('Missing 3-step proposition');
   await page.locator('.dp-quiz-invite').screenshot({path:OUT+'/invite-center.png'});

   await page.locator('[data-dpq-hide]').click();
   if(await page.locator('.dp-quiz-invite').isVisible())throw new Error('Invite did not dismiss');
   await page.screenshot({path:OUT+'/invite-dismissed.png'});
   return {scenario:'invite',threshold:'10s and 35%',modalAutoOpened:false,ratio};
 }finally{await page.close()}
}
try{
 const results=[];
 results.push(await invitePolicySmoke());
 results.push(await test({width:1440,height:900},'desktop','p4','w_compare','b_no','max'));
 results.push(await test({width:390,height:844},'mobile390','p4','w_compare','b_no','whatsapp'));
 results.push(await test({width:320,height:690},'mobile320','p2','w_no','b_no','telegram'));
 // The conflict requires honest disclosure rather than a false zero-result screen.
 results.push(await test({width:390,height:844},'bedroom-compromise','p8','w_no','b_yes','max'));
 console.log('QUIZ_BROWSER=PASS',JSON.stringify(results));
}catch(e){problems.push(e.message);console.error('QUIZ_BROWSER=FAIL',e.message);process.exitCode=1}
finally{await browser.close()}
