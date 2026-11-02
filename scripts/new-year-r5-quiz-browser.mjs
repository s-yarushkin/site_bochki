import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const BASE='http://127.0.0.1:4187/novyy-god/';
const OUT='output/new-year-r5-browser';
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
async function doCase(width,height,name){
 const page=await browser.newPage({viewport:{width,height}});
 try{
  page.on('pageerror',e=>errors.push(name+': '+e.message));
  const res=await page.goto(BASE,{waitUntil:'networkidle'});
  if(!res.ok())throw Error(name+' page status '+res.status());
  await page.locator('#dp-quiz-open').waitFor({timeout:12000});
  if(await page.locator('.dp-quiz-invite[open]').count())throw Error(name+' popped before eight seconds');
  // The timer starts only while page is visible; no scrolling or inactivity required.
  await page.locator('.dp-quiz-invite[open]').waitFor({state:'visible',timeout:11000});
  await page.screenshot({path:OUT+'/'+name+'-invitation.png'});
  if(await page.locator('#lead-dialog[open]').count())throw Error(name+' unrelated form opened');
  await page.locator('.dp-quiz-invite [data-dpq-open]').click();
  await page.locator('#dp-quiz-dialog[open]').waitFor();
  const cases=[
    {title:'Сколько человек обычно будет в бане?',values:['p2','p4','p6','p8'],answer:'p4',labels:['1–2 человека','До 4 человек','5–6 человек','До 8 человек']},
    {title:'Нужна отдельная помывочная?',values:['w_yes','w_no','w_compare'],answer:'w_compare',labels:['Да, отдельная помывочная','Без отдельной помывочной','Хочу сравнить']},
    {title:'Нужно место, чтобы остаться на ночь?',values:['b_yes','b_no'],answer:'b_no',labels:['Да, со спальней','Только для банного отдыха']}
  ];
  for(let i=0;i<cases.length;i++){
   const q=cases[i];
   const title=await page.locator('#dp-quiz-title').innerText();
   if(title!==q.title)throw Error(name+' quiz question changed: '+title);
   const opts=await page.locator('#dp-quiz-dialog [data-dpq="answer"]').evaluateAll(xs=>xs.map(x=>({id:x.dataset.value,label:x.querySelector('strong')?.textContent})));
   if(JSON.stringify(opts.map(x=>x.id))!==JSON.stringify(q.values)||JSON.stringify(opts.map(x=>x.label))!==JSON.stringify(q.labels))
    throw Error(name+' quiz answer set/order changed '+JSON.stringify(opts));
   if(i===0)await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+name+'-questions.png'});
   await page.locator('#dp-quiz-dialog [data-dpq="answer"][data-value="'+q.answer+'"]').click();
  }
  await page.locator('#dp-quiz-dialog .dp-quiz-results').waitFor();
  if(await page.locator('#dp-quiz-dialog .dp-quiz-plan').count()<1)throw Error(name+' original engine produced no recommendations');
  if(!await page.locator('#dp-quiz-dialog .dp-quiz-cta').innerText().then(x=>x.includes('20 000 ₽')))throw Error(name+' Deluxe price benefit missing');
  await page.locator('#dp-quiz-dialog').screenshot({path:OUT+'/'+name+'-results.png'});
  await page.locator('#dp-quiz-dialog [data-dpq="form"]').click();
  await page.locator('#dp-quiz-dialog #dp-quiz-contact-form').waitFor();
  await page.locator('#dp-quiz-phone').fill('9991234567');
  await page.locator('#dp-quiz-city').fill('Переславль-Залесский');
  await page.locator('#dp-quiz-dialog label.dp-quiz-channel').filter({hasText:'MAX'}).click();
  await page.locator('#dp-quiz-contact-form button[type="submit"]').click();
  await page.locator('#dp-quiz-dialog .dp-quiz-good').waitFor({timeout:12000});
  const receipt=await page.evaluate(async()=>await (await fetch('/_test/receipts')).json());
  if(receipt.last?.source!=='квиз новый год'||receipt.last?.flow!=='callback'||receipt.last?.pagePath!=='/novyy-god/'||
    !receipt.last?.hasHolidayContext||!receipt.last?.answers?.includes('помывочная сравнить оба'))
    throw Error(name+' quiz source/answers lost in MAX lead '+JSON.stringify(receipt));
  await page.locator('#dp-quiz-dialog [data-dpq="close"]').click();
  await page.waitForTimeout(850);
  if(await page.locator('.dp-quiz-invite[open]').count())throw Error(name+' quiz invite repeated within same session');
  if(errors.length)throw Error(name+' JS page errors '+errors.join('; '));
  console.log('NY2027_R5_QUIZ_SCENE=PASS',name,JSON.stringify({titleCount:cases.length,leadSource:receipt.last.source,answerSummary:receipt.last.answers}));
 }finally{await page.close()}
}
try{
 await doCase(1440,900,'desktop1440');
 await doCase(390,844,'mobile390');
 console.log('NY2027_R5_QUIZ_BROWSER=PASS');
}catch(e){console.error('NY2027_R5_QUIZ_BROWSER=FAIL',e.message);process.exitCode=1}
finally{await browser.close()}
