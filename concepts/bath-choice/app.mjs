import {HERO_MODELS} from '../home-hero/catalog.mjs';
import {roofPoints} from '../home-hero/roof-points.mjs';
import {createLayoutPanel} from '../home-hero/layout-panel.mjs';
import {openModelRequest} from '../home-hero/model-request.mjs';
import {normalizeChoice,choiceFromUrl,choiceUrl,choicePrice,choiceSizeLabel} from './state.mjs';
import {PACKAGE_NAMES} from './packages.mjs';
import {createPhotoGallery} from './gallery.mjs';
import {openPackageComparison} from './comparison.mjs';
import {connectHomeContinuation} from './continuation.mjs?v=phone-callback-20261105';

const $=selector=>document.querySelector(selector);
const money=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0});
const descriptions={kvadro:'Парная и комната отдыха в компактном корпусе шириной 2,1 м.',parus:'Прямые стены и ширина 2,4 м для удобной расстановки полков и мебели.',viking:'Выразительный арочный фасад и пространство для своего банного вечера.', 'kvadro-house':'Отдельные помещения для парения, душа и отдыха с близкими.'};
const names={1:'Парная и комната отдыха',2:'Парная и комната отдыха',3:'Просторная парная',4:'С помывочной',5:'С душевой нишей',6:'С помывочной',7:'С санузлом',8:'Для компании',9:'Со спальней',10:'С просторной комнатой отдыха',11:'Со спальней и хранением',12:'С помывочной',13:'С помывочной',14:'Парная и комната отдыха'};
function node(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('LOAD');return r.json();}

const [book,registry,photos]=await Promise.all([json('/data/catalog-pricebook.json'),json('/choice/layouts.json'),json('/choice/photos.json')]);
const plans=registry.plans;
let state=choiceFromUrl(book,plans,location.href),imageTicket=0;
const setPlan=createLayoutPanel($('[data-plan-panel]'),{onRequest:opener=>request(opener,'layout_quote')});
const setPhotos=createPhotoGallery($('[data-gallery]'));
const syncHome=connectHomeContinuation({getState:()=>state,getBook:()=>book,plans});

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
 selection.append(radio,heading,price,node('p',key==='comfort'?'Печь, полки, мебель, свет и вентиляция.':'Печь с двумя каменками, подсветка и утеплённый пол.','choice-package-description'));
 card.append(selection);
 if(key==='deluxe')card.append($('[data-compare]'));
 $('[data-package-cards]').append(card);radio.addEventListener('change',()=>choose({package:key}));
}
$('[data-compare]').addEventListener('click',event=>openPackageComparison({
 selection:HERO_MODELS[state.model].name+' · '+choiceSizeLabel(book,state.model,state.size),opener:event.currentTarget
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
  $('[data-package-price="'+key+'"]').textContent=money.format(choicePrice(book,{...state,package:key}));
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
  $('[data-plan-options]').replaceChildren(...available.map(plan=>{const button=node('button',names[plan.number]||'Вариант планировки');button.type='button';button.setAttribute('aria-pressed',String(plan.id===state.layout));button.addEventListener('click',()=>{choose({layout:plan.id});$('[data-plan-options] button[aria-pressed="true"]')?.focus({preventScroll:true});revealPlanning();});return button;}));
  $('[data-plan-options]').hidden=available.length<2;$('[data-plan-empty]').hidden=available.length>0;
  const plan=available.find(p=>p.id===state.layout);setPlan(plan?{...plan,label:info.name+' · '+label}:null);
 }
 document.title=info.name+' '+label+' · ДачаПар';
 syncHome();
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
function request(opener,reason='quote'){openModelRequest({name:HERO_MODELS[state.model].name,size:choiceSizeLabel(book,state.model,state.size),packageName:PACKAGE_NAMES[state.package],layout:state.layout||undefined,reason,opener});}
$('[data-plan-request]').addEventListener('click',event=>request(event.currentTarget,state.layout?'layout_quote':'quote'));
$('[data-production]').addEventListener('click',event=>request(event.currentTarget,'production'));
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
