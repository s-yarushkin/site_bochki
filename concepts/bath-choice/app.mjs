import {HERO_MODELS} from '../home-hero/catalog.mjs';
import {roofPoints} from '../home-hero/roof-points.mjs';
import {createLayoutPanel} from '../home-hero/layout-panel.mjs';
import {openModelRequest} from '../home-hero/model-request.mjs';
import {normalizeChoice,choiceFromUrl,choiceUrl,choicePrice} from './state.mjs';
import {PACKAGE_NAMES,PACKAGE_POINTS,COMPARISON} from './packages.mjs';

const $=selector=>document.querySelector(selector);
const money=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0});
const descriptions={kvadro:'Парная и комната отдыха в компактном корпусе шириной 2,1 м.',parus:'Прямые стены и ширина 2,4 м для удобной расстановки полков и мебели.',viking:'Выразительный арочный фасад и пространство для своего банного вечера.', 'kvadro-house':'Отдельные помещения для парения, душа и отдыха с близкими.'};
const names={1:'Парная и комната отдыха',2:'Парная и комната отдыха',3:'Просторная парная',4:'С помывочной',5:'С душевой нишей',6:'С помывочной',7:'С санузлом',8:'Для компании',9:'Со спальней',10:'С просторной комнатой отдыха',11:'Со спальней и хранением',12:'С помывочной',13:'С помывочной',14:'Парная и комната отдыха'};
function node(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('LOAD');return r.json();}

const [book,registry,photos]=await Promise.all([json('/data/catalog-pricebook.json'),json('/choice/layouts.json'),json('/choice/photos.json')]);
const plans=registry.plans;
let state=choiceFromUrl(book,plans,location.href),imageTicket=0;
const setPlan=createLayoutPanel($('[data-plan-panel]'));

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
 const card=node('label',null,'choice-package-card');card.dataset.packageCard=key;
 const radio=document.createElement('input');radio.type='radio';radio.name='package';radio.value=key;
 const heading=node('h3','В комплектации «'+label+'»');const price=node('strong',null,'choice-package-price');price.dataset.packagePrice=key;
 const list=node('ul');list.append(...PACKAGE_POINTS[key].map(text=>node('li',text)));
 card.append(radio,heading,price,list);$('[data-package-cards]').append(card);
 radio.addEventListener('change',()=>choose({package:key}));
}

function comparison(rows,compact=false){
 const wrap=node('div',null,'choice-compare-rows');
 for(const row of rows){const entry=node('div',null,'choice-compare-row');entry.append(node('h4',row.title));
  for(const key of ['comfort','deluxe']){const value=node('div');value.append(node('small','В комплектации «'+PACKAGE_NAMES[key]+'»'),node('p',row[key]));entry.append(value);}
  wrap.append(entry);
 }
 return wrap;
}
const primaryTitles=['Входная дверь','Окно комнаты отдыха','Вынос топки','Уличное освещение','Утепление пола 50 мм','Стол'];
$('[data-inline-comparison]').append(comparison(COMPARISON.filter(row=>primaryTitles.includes(row.title)),true));

function openCompare(opener){
 const dialog=node('dialog',null,'choice-compare-dialog');dialog.setAttribute('aria-labelledby','choice-comparison-title');
 const header=node('header');const title=node('h2','Сравните комплектации');title.id='choice-comparison-title';
 const close=node('button','Закрыть ×');close.type='button';close.addEventListener('click',()=>dialog.close());header.append(title,close);
 const selection=node('p',HERO_MODELS[state.model].name+' · '+book.r85.models[state.model].sizes[state.size].label,'choice-compare-selection');
 const prices=node('div',null,'choice-compare-prices');
 for(const key of ['comfort','deluxe']){const box=node('div');box.append(node('span','В комплектации «'+PACKAGE_NAMES[key]+'»'),node('strong',money.format(choicePrice(book,{...state,package:key}))));prices.append(box);}
 dialog.append(header,selection,prices);
 for(const group of [...new Set(COMPARISON.map(row=>row.group))]){const section=node('section');section.append(node('h3',group),comparison(COMPARISON.filter(row=>row.group===group)));dialog.append(section);}
 dialog.addEventListener('close',()=>{dialog.remove();if(opener.isConnected)opener.focus({preventScroll:true});},{once:true});
 document.body.append(dialog);dialog.showModal();
}
document.querySelectorAll('[data-compare]').forEach(button=>button.addEventListener('click',event=>openCompare(event.currentTarget)));

function openPhoto(photo,opener){
 const dialog=node('dialog',null,'choice-photo-dialog'),header=node('header'),close=node('button','Закрыть ×');close.type='button';header.append(node('h2',photo.caption),close);
 const image=new Image();image.src=photo.image;image.alt=photo.caption;dialog.append(header,image);close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{dialog.remove();opener.focus({preventScroll:true});},{once:true});document.body.append(dialog);dialog.showModal();
}

function render(previous){
 const info=HERO_MODELS[state.model],row=book.r85.models[state.model].sizes[state.size];
 if(!previous||previous.model!==state.model){
  setHero(state.model);$('#choice-title').textContent=info.name;$('[data-description]').textContent=descriptions[state.model];
  for(const button of document.querySelectorAll('[data-model-card]'))button.setAttribute('aria-pressed',String(button.dataset.modelCard===state.model));
  $('[data-sizes]').replaceChildren(...Object.entries(book.r85.models[state.model].sizes).map(([key,value])=>{const b=node('button',value.label);b.type='button';b.dataset.sizePicker=key;b.addEventListener('click',()=>{choose({size:key});b.focus({preventScroll:true});});return b;}));
  $('[data-photos]').replaceChildren(...photos[state.model].map(photo=>{const figure=node('figure'),button=node('button'),image=new Image();button.type='button';image.src=photo.image;image.alt=photo.caption;image.loading='lazy';image.width=960;image.height=640;button.append(image);button.setAttribute('aria-label','Открыть фото: '+photo.caption);button.addEventListener('click',()=>openPhoto(photo,button));figure.append(button,node('figcaption',photo.caption));return figure;}));
  $('[data-delivery]').textContent=state.model==='kvadro-house'?'«Квадро Хаус» соберём на подготовленном основании. Сборка уже учтена в цене бани.':'Привезём готовую баню и поставим на подготовленное основание. Заранее проверим условия подъезда и установки.';
 }
 for(const button of document.querySelectorAll('[data-size-picker]'))button.setAttribute('aria-pressed',String(button.dataset.sizePicker===state.size));
 for(const key of ['comfort','deluxe']){
  $('[data-package-price="'+key+'"]').textContent=money.format(choicePrice(book,{...state,package:key}));
  $('input[name="package"][value="'+key+'"]').checked=state.package===key;
  $('[data-package-card="'+key+'"]').classList.toggle('is-selected',state.package===key);
 }
 $('[data-selection-summary]').textContent=info.name+' · '+row.label+' · '+money.format(choicePrice(book,state));
 $('[data-plan-size]').textContent=info.name+' · '+row.label;
 if(!previous||['model','size','layout'].some(key=>previous[key]!==state[key])){
  const available=plans.filter(p=>p.models.includes(state.model)&&p.size===state.size);
  $('[data-plan-options]').replaceChildren(...available.map(plan=>{const button=node('button',names[plan.number]||'Вариант планировки');button.type='button';button.setAttribute('aria-pressed',String(plan.id===state.layout));button.addEventListener('click',()=>{choose({layout:plan.id});$('[data-plan-options] button[aria-pressed="true"]')?.focus({preventScroll:true});});return button;}));
  $('[data-plan-options]').hidden=available.length<2;$('[data-plan-empty]').hidden=available.length>0;
  const plan=available.find(p=>p.id===state.layout);setPlan(plan?{...plan,label:info.name+' · '+row.label}:null);
 }
 document.title=info.name+' '+row.label+' · ДачаПар';
}
function choose(patch){const previous=state;state=normalizeChoice(book,plans,{...state,...patch});const url=choiceUrl(location.href,state);if(url.href!==location.href)history.pushState(null,'',url);render(previous);}
document.querySelectorAll('[data-model-card]').forEach(button=>button.addEventListener('click',()=>choose({model:button.dataset.modelCard})));
window.addEventListener('popstate',()=>{const previous=state;state=choiceFromUrl(book,plans,location.href);render(previous);});
function request(opener,reason='quote'){openModelRequest({name:HERO_MODELS[state.model].name,size:book.r85.models[state.model].sizes[state.size].label,packageName:PACKAGE_NAMES[state.package],layout:state.layout||undefined,reason,opener});}
document.querySelectorAll('[data-request]').forEach(b=>b.addEventListener('click',event=>request(event.currentTarget)));
$('[data-production]').addEventListener('click',event=>request(event.currentTarget,'production'));
$('[data-foundation]').addEventListener('click',event=>request(event.currentTarget,'foundation'));
$('[data-start-quiz]').addEventListener('click',()=>$('#dp-quiz-open')?.click());
const menu=$('#choice-menu'),menuButton=$('[aria-controls="choice-menu"]');menuButton.addEventListener('click',()=>{menu.hidden=!menu.hidden;menuButton.setAttribute('aria-expanded',String(!menu.hidden));});menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.hidden=true;menuButton.setAttribute('aria-expanded','false');}));
history.replaceState(null,'',choiceUrl(location.href,state));render();
