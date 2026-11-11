import {campaignChoiceQuote,campaignPhase,syncCampaignClock} from '/campaigns/blackfriday.mjs';
import {HERO_MODELS} from '../choice/home-hero/catalog.mjs';
import {roofPoints} from '../choice/home-hero/roof-points.mjs';
import {createLayoutPanel} from '../choice/home-hero/layout-panel.mjs?v=album-22-20261105';
import {openModelRequest} from '../choice/home-hero/model-request.mjs?v=quiz-overview-20261106';
import {normalizeChoice,choiceFromUrl,choiceUrl,choicePrice,choiceSizeLabel} from './state.mjs';
import {PACKAGE_NAMES,PACKAGE_COPY} from './packages.mjs?v=packages-contact-20261106';
import {createPhotoGallery} from './gallery.mjs';
import {openPackageComparison} from './comparison.mjs?v=packages-contact-20261106';
import {connectHomeContinuation} from './continuation.mjs?v=packages-contact-20261106';

const $=selector=>document.querySelector(selector);
const money=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0});
const descriptions={kvadro:'Парная и комната отдыха в компактном корпусе шириной 2,1 м.',parus:'Прямые стены и ширина 2,4 м для удобной расстановки полков и мебели.',viking:'Выразительный арочный фасад и пространство для своего банного вечера.', 'kvadro-house':'Отдельные помещения для парения, душа и отдыха с близкими.'};
function node(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('LOAD');syncCampaignClock(r);return r.json();}

const [book,registry,photos]=await Promise.all([json('/choice/catalog-pricebook.json'),json('/home-hero/layouts/index.json?album=22-20261105'),json('/choice/photos.json')]);
const plans=registry.plans;
let state=choiceFromUrl(book,plans,location.href),imageTicket=0;
const setPlan=createLayoutPanel($('[data-plan-panel]'),{onRequest:(opener,plan)=>request(opener,'layout_quote',plan)});
const setPhotos=createPhotoGallery($('[data-gallery]'));
connectHomeContinuation();

function setHero(model){
 const info=HERO_MODELS[model],ticket=++imageTicket,world=$('#hh-world'),depth=$('#hh-depth-image');
 $('[data-hero-name]').textContent=info.name;
 const ready=()=>{
  if(ticket!==imageTicket)return;
  world.srcset=`/choice/assets/${info.asset}-640.webp 640w,/choice/assets/${info.asset}-1280.webp 1280w,/choice/assets/${info.asset}-1920.webp 1920w`;
  world.src=`/choice/assets/${info.asset}-1920.webp`;world.alt=info.name+' в вечернем саду';world.hidden=false;world.classList.remove('is-loading');
  $('#hh-roof-points').setAttribute('points',roofPoints[model]);
  if(matchMedia('(min-width:1101px)').matches)depth.setAttribute('href',world.currentSrc||world.src);
 };
 if(world.src.endsWith('/'+info.asset+'-1920.webp')&&world.complete){ready();return;}
 world.classList.add('is-loading');
 const image=new Image();image.srcset=`/choice/assets/${info.asset}-640.webp 640w,/choice/assets/${info.asset}-1280.webp 1280w,/choice/assets/${info.asset}-1920.webp 1920w`;image.sizes='100vw';image.onload=ready;
 image.onerror=()=>{if(ticket===imageTicket){world.hidden=true;depth.removeAttribute('href');}};
 image.src=`/choice/assets/${info.asset}-1920.webp`;
}
function syncDepth(){const image=$('#hh-world'),depth=$('#hh-depth-image');if(matchMedia('(min-width:1101px)').matches&&!image.hidden)depth.setAttribute('href',image.currentSrc||image.src);else depth.removeAttribute('href');}
$('#hh-world').addEventListener('load',syncDepth);matchMedia('(min-width:1101px)').addEventListener('change',syncDepth);

for(const [key,label] of Object.entries(PACKAGE_NAMES)){
 const card=node('div',null,'choice-package-card');card.dataset.packageCard=key;
 const selection=node('label',null,'choice-package-select');
 const radio=document.createElement('input');radio.type='radio';radio.name='package';radio.value=key;
 const heading=node('h3','Комплектация «'+label+'»');
 const price=node('strong',null,'choice-package-price');price.dataset.packagePrice=key;
 const campaign=node('div',null,'choice-campaign');campaign.dataset.campaign=key;
 selection.append(radio,heading,campaign,price,node('p',PACKAGE_COPY[key],'choice-package-description'));
 card.append(selection);
 if(key==='deluxe')card.append($('[data-compare]'));
 $('[data-package-cards]').append(card);radio.addEventListener('change',()=>choose({package:key}));
}
for(const trigger of document.querySelectorAll('[data-compare],[data-compare-details]'))trigger.addEventListener('click',event=>openPackageComparison({
 selection:HERO_MODELS[state.model].name+' · '+choiceSizeLabel(book,state.model,state.size),prices:{comfort:choicePrice(book,{...state,package:'comfort'}),deluxe:choicePrice(book,{...state,package:'deluxe'})},opener:event.currentTarget
}));

function render(previous){
 const info=HERO_MODELS[state.model],label=choiceSizeLabel(book,state.model,state.size);
 if(!previous||previous.model!==state.model){
  setHero(state.model);$('#choice-title').textContent=info.name;$('[data-description]').textContent=descriptions[state.model];
  for(const button of document.querySelectorAll('[data-model-card]'))button.setAttribute('aria-pressed',String(button.dataset.modelCard===state.model));
  $('[data-sizes]').replaceChildren(...Object.keys(book.r85.models[state.model].sizes).map(key=>{const b=node('button',choiceSizeLabel(book,state.model,key));b.type='button';b.dataset.sizePicker=key;b.addEventListener('click',()=>{choose({size:key});b.focus({preventScroll:true});revealPlanning();});return b;}));
  setPhotos(photos[state.model]);
 }
 for(const button of document.querySelectorAll('[data-size-picker]'))button.setAttribute('aria-pressed',String(button.dataset.sizePicker===state.size));
 for(const key of ['comfort','deluxe']){
  const q=campaignChoiceQuote(book,{...state,package:key}),campaign=$('[data-campaign="'+key+'"]');campaign.replaceChildren();
  if(q&&q.phase!=='ended'){
   const badge=node('a',q.phase==='active'?'Чёрная пятница':'Чёрная пятница · с 11 ноября','choice-campaign-badge');badge.href='/blackfriday/?model='+state.model+'&size='+state.size+'&package='+key;campaign.append(badge);
   if(q.phase==='active'){campaign.append(node('del','от '+money.format(q.reference),'choice-campaign-reference'),node('span','Скидка '+money.format(q.discountRub),'choice-campaign-saving'));}
   campaign.append(node('small','При заключении договора 11–21 ноября 2026.'));
  }
  $('[data-package-price="'+key+'"]').textContent='от '+money.format(choicePrice(book,{...state,package:key}));
  $('input[name="package"][value="'+key+'"]').checked=state.package===key;
  $('[data-package-card="'+key+'"]').classList.toggle('is-selected',state.package===key);
 }
 $('[data-selection-summary]').textContent=info.name+' · '+label+' · в комплектации «'+PACKAGE_NAMES[state.package]+'»';
 $('[data-plan-size]').textContent=info.name+' · '+label;
 $('[data-plan-request]').textContent='Получить предложение ↗';
 $('[data-plan-request]').setAttribute('aria-label','Получить предложение по выбранной бане и планировке');
 $('[data-request-description]').textContent='Доставку и основание рассчитаем для вашего участка.';
 if(!previous||['model','size','layout'].some(key=>previous[key]!==state[key])){
  const available=plans.filter(p=>p.models.includes(state.model)&&p.size===state.size);
  $('#plans-title').textContent=available.length>1?'Примеры планировок':'Пример планировки';
  $('[data-plan-options]').replaceChildren(...available.map(plan=>{const button=node('button',plan.id.toUpperCase());button.type='button';button.setAttribute('aria-pressed',String(plan.id===state.layout));button.addEventListener('click',()=>{choose({layout:plan.id});$('[data-plan-options] button[aria-pressed="true"]')?.focus({preventScroll:true});revealPlanning();});return button;}));
  $('[data-plan-options]').hidden=available.length<2;$('[data-plan-empty]').hidden=available.length>0;
  const plan=available.find(p=>p.id===state.layout);setPlan(plan?{...plan,label:info.name+' · '+label+' · '+plan.id.toUpperCase()}:null);
 }
 document.title=info.name+' '+label+' · ДачаПар';
}
function choose(patch){const previous=state;state=normalizeChoice(book,plans,{...state,...patch});const url=choiceUrl(location.href,state);if(url.href!==location.href)history.pushState(null,'',url);render(previous);}
function revealPlanning(){
 requestAnimationFrame(()=>{
  const plan=$('#plans').getBoundingClientRect(),bar=$('#models').getBoundingClientRect();
  if(plan.bottom>innerHeight-12||plan.top<Math.max(0,bar.bottom)){
   const target=matchMedia('(max-width:760px)').matches?$('.choice-sizes'):$('#bath-model');
   // Offset only this product block; the legacy page has its own anchor padding.
   const top=Math.max(0,scrollY+target.getBoundingClientRect().top-bar.height-12);
   window.scrollTo({top,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  }
 });
}
document.querySelectorAll('[data-model-card]').forEach(button=>button.addEventListener('click',()=>{choose({model:button.dataset.modelCard});}));
window.addEventListener('popstate',()=>{const previous=state;state=choiceFromUrl(book,plans,location.href);render(previous);});
function request(opener,reason='quote',plan){const selected=plan?{...state,model:plan.models.includes(state.model)?state.model:plan.models[0],size:plan.size,layout:plan.id}:state;openModelRequest({name:HERO_MODELS[selected.model].name,size:choiceSizeLabel(book,selected.model,selected.size),packageName:PACKAGE_NAMES[selected.package],layout:selected.layout||undefined,reason,opener,campaignOffer:campaignChoiceQuote(book,selected)});}
$('[data-plan-request]').addEventListener('click',event=>request(event.currentTarget,'quote'));
$('[data-production]')?.addEventListener('click',event=>request(event.currentTarget,'production'));
$('[data-foundation]')?.addEventListener('click',event=>request(event.currentTarget,'foundation'));
function quizReady(){
 const entry=$('#dp-quiz-open');if(entry)return Promise.resolve(entry);
 return new Promise((resolve,reject)=>{
  const observer=new MutationObserver(()=>{const button=$('#dp-quiz-open');if(button){clearTimeout(timer);observer.disconnect();resolve(button);}});
  const timer=setTimeout(()=>{observer.disconnect();reject(Error('QUIZ_NOT_READY'));},12000);
  observer.observe(document.body,{childList:true,subtree:true});
 });
}
document.querySelectorAll('[data-start-quiz]').forEach(button=>button.addEventListener('click',async()=>{
 button.disabled=true;const feedback=$('[data-quiz-feedback]');feedback.hidden=true;
 try{const entry=await quizReady();entry.click();$('#dp-quiz-dialog')?.addEventListener('close',()=>button.focus({preventScroll:true}),{once:true});}
 catch{feedback.textContent='Подбор пока недоступен. Поможем по телефону +7 (951) 734-99-99.';feedback.hidden=false;}
 finally{button.disabled=false;}
}));
const menu=$('#choice-menu'),menuButton=$('[aria-controls="choice-menu"]');menuButton.addEventListener('click',()=>{menu.hidden=!menu.hidden;menuButton.setAttribute('aria-expanded',String(!menu.hidden));});menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.hidden=true;menuButton.setAttribute('aria-expanded','false');}));
history.replaceState(null,'',choiceUrl(location.href,state));render();

let campaignWindow=campaignPhase();setInterval(()=>{const next=campaignPhase();if(next!==campaignWindow){campaignWindow=next;render(state);}},15000);
