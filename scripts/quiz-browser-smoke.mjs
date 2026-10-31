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
 if(cards<2||cards>4)throw new Error(label+' wrong results count: '+cards);
 if(await page.locator(selectors.phone).count())throw new Error(label+' phone shown before result CTA');
 await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+label+'-result.png'});
 if(await page.locator('#dp-quiz-dialog [data-dpq="form"]').count()!==1)throw new Error(label+' repeated contact CTA');
 const anyPlan=page.locator('.dp-quiz-plan [data-dpq="detail"]').first();
 await anyPlan.click();
 await page.waitForSelector('.dp-quiz-detail-meta');
 if(await page.locator('#dp-quiz-dialog [data-dpq="form"]').count()!==0)throw new Error(label+' contact CTA inside plan detail');
 await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+label+'-detail.png'});
 await page.locator('[data-dpq="results"]').click();
 await page.locator('[data-dpq="form"]').click();
 await page.waitForSelector(selectors.phone);
 const options=await page.locator('#dp-quiz-contact-form input[name="channel"]').count();
 if(options!==3)throw new Error(label+' expected MAX WhatsApp Telegram');
 await page.locator('#dp-quiz-contact-form input[name="channel"][value="'+channel+'"]').check();
 await page.locator(selectors.phone).fill('+7 (999) 123-45-67');
 await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+label+'-form.png'});
 const dimensions=await page.evaluate(()=>{
   const root=document.querySelector('#dp-quiz-dialog'),frame=root.querySelector('.dp-quiz-frame'),main=root.querySelector('.dp-quiz-main');
   return {vw:innerWidth,dialogWidth:root.getBoundingClientRect().width,frameScrollWidth:frame.scrollWidth,frameClientWidth:frame.clientWidth,mainScrollWidth:main.scrollWidth,mainClientWidth:main.clientWidth};
 });
 if(dimensions.dialogWidth>viewport.width+1)throw new Error(label+' dialog too wide '+JSON.stringify(dimensions));
 if(dimensions.mainScrollWidth>dimensions.mainClientWidth+8)throw new Error(label+' horizontal quiz overflow '+JSON.stringify(dimensions));
 await page.locator('#dp-quiz-contact-form [type="submit"]').click();
 try{await page.waitForSelector('.dp-quiz-good',{timeout:7000});}catch(e){const details=await page.evaluate(()=>({errors:[...document.querySelectorAll('.dp-quiz-error')].map(x=>x.textContent),visibleTitle:document.querySelector('#dp-quiz-title')?.textContent,channel:document.querySelector('input[name="channel"]:checked')?.value,phone:document.querySelector('#dp-quiz-phone')?.value?.length}));throw new Error(label+' form failure '+JSON.stringify({details,requestSent:!!sent})+' '+e.message)}
 if(!sent)throw new Error(label+' no lead request');
 if(sent.purpose!=='quiz_catalog'||sent.flow!=='callback'||sent.contactChannel!==channel)throw new Error(label+' wrong channel payload '+JSON.stringify({purpose:sent.purpose,flow:sent.flow,contactChannel:sent.contactChannel}));
 if(!sent.comment?.includes('DP-PL-'))throw new Error(label+' layout codes missing');
 await page.keyboard.press('Escape');
 if(await page.locator('#dp-quiz-dialog[open]').count())throw new Error(label+' Escape failed');
 if(errors.length)throw new Error(label+' JS errors: '+errors.join('; '));
 await page.close();
 return {label,cards,channel,dimensions};
}
try{
 const results=[];
 results.push(await test({width:1440,height:900},'desktop','p4','w_compare','b_no','max'));
 results.push(await test({width:390,height:844},'mobile390','p4','w_compare','b_no','whatsapp'));
 results.push(await test({width:320,height:690},'mobile320','p2','w_no','b_no','telegram'));
 // The conflict requires honest disclosure rather than a false zero-result screen.
 results.push(await test({width:390,height:844},'bedroom-compromise','p8','w_no','b_yes','max'));
 console.log('QUIZ_BROWSER=PASS',JSON.stringify(results));
}catch(e){problems.push(e.message);console.error('QUIZ_BROWSER=FAIL',e.message);process.exitCode=1}
finally{await browser.close()}
