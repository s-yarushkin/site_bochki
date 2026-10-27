import {CHOICE_KEY,REFERENCE_KEY,readJSON,writeJSON,selectPlan,variantURL} from './journey-state.mjs?v=r100-20261027';
import {openPlanInfoRequest} from './plan-request.mjs?v=r100-20261027';
import {analytics} from './analytics-runtime.mjs?v=r100-20261027';

const MODELS=[
 {id:'kvadro',name:'Квадро',photo:'/assets/kvadro-garden-r7-600.webp'},
 {id:'viking',name:'Викинг',photo:'/assets/viking-p3-600.webp'},
 {id:'parus',name:'Парус',photo:'/assets/parus-garden-r7-600.webp'},
 {id:'kvadro-house',name:'Квадро Хаус',photo:'/assets/house-p3-600.webp'}
];
const root=document.querySelector('#plan-gallery');
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls='plans-button')=>{const n=el('button',text,cls);n.type='button';return n};
const num=n=>String(n).replace('.',',');
const dimensions=p=>num(p.dimensions.lengthM)+' × '+num(p.dimensions.widthM)+' м';
const sizeKey=p=>p.dimensions.lengthM+'x'+p.dimensions.widthM;
const modelName=id=>MODELS.find(m=>m.id===id)?.name||'';
const label=p=>modelName(p.model)+' '+dimensions(p)+' · вариант '+p.variantNumber;
let plans=[],model='all',size='all',viewer=null;const compared=new Set();
async function choose(p,mirror=false){try{const r=await fetch('/data/catalog-pricebook.json',{cache:'no-cache'});if(!r.ok)throw Error();const catalog=await r.json(),state=selectPlan(catalog,p,mirror,readJSON(localStorage,CHOICE_KEY)||{});writeJSON(localStorage,CHOICE_KEY,state);analytics.track('dp_plan_select',{placement:'plans',model:p.model,plan_id:p.id,mirrored:mirror});location.assign(variantURL(location.origin,state,readJSON(localStorage,REFERENCE_KEY)));}catch{root.querySelector('.plans-status').textContent='Не удалось сохранить выбор. Обновите страницу или перейдите к расчёту с главной.';}}
function compare(){const d=el('dialog',undefined,'r100-plan-compare');d.setAttribute('aria-label','Сравнение планировок');const close=button('Закрыть ×');close.addEventListener('click',()=>d.close());const grid=el('div',undefined,'r100-compare-grid');for(const p of plans.filter(p=>compared.has(p.id))){const card=el('article');const img=el('img');img.src='/'+p.image;img.alt=label(p);const use=button('Выбрать и рассчитать','plans-button plans-primary');use.addEventListener('click',()=>choose(p));card.append(el('h2',label(p)),img,el('p',p.description),el('p',p.firebox),el('p',p.note),use);grid.append(card);}d.append(close,grid);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();analytics.track('dp_plan_compare',{placement:'plans'});}
function comparisonBar(){let bar=root.querySelector('.r100-plan-comparison');if(!bar){bar=el('div',undefined,'r100-plan-comparison');root.querySelector('.plans-controls').append(bar);}bar.replaceChildren(el('span','Отметьте две схемы для сравнения · '+compared.size+'/2'));const open=button('Сравнить планировки');open.disabled=compared.size!==2;open.addEventListener('click',compare);const clear=button('Сбросить');clear.disabled=!compared.size;clear.addEventListener('click',()=>{compared.clear();draw()});bar.append(open,clear);}
function writeURL(plan=null,mirror=false,push=false){
 const u=new URL(location.href);for(const k of['model','size','plan','mirror'])u.searchParams.delete(k);
 if(model!=='all')u.searchParams.set('model',model);if(size!=='all')u.searchParams.set('size',size);
 if(plan){u.searchParams.set('plan',plan.id);if(mirror)u.searchParams.set('mirror','1')}
 u.hash='';history[push?'pushState':'replaceState']({...history.state,planGallery:true},'',u);document.title=(model==='all'?'Планировки бань':'Планировки · '+modelName(model))+' | Дача Пар';
}
function readURL(){const q=new URLSearchParams(location.search);model=MODELS.some(m=>m.id===q.get('model'))?q.get('model'):'all';size=q.get('size')||'all';if(!plans.some(p=>(model==='all'||p.model===model)&&sizeKey(p)===size))size='all'}
function visible(){
 const matches=plans.filter(p=>(model==='all'||p.model===model)&&(size==='all'||sizeKey(p)===size));
 if(model!=='all')return matches;
 const groups=MODELS.map(m=>matches.filter(p=>p.model===m.id)),result=[];
 for(let i=0;i<Math.max(...groups.map(a=>a.length));i++)for(const group of groups)if(group[i])result.push(group[i]);
 return result;
}
function changeModel(id){model=id;size='all';viewer?.close();writeURL(null,false,true);draw();window.scrollTo({top:0,behavior:'instant'});root.querySelector('[data-model="'+id+'"]')?.focus({preventScroll:true})}
function draw(){
 const focused=document.activeElement?.dataset?.comparePlan;
 const models=root.querySelector('.plans-models');models.replaceChildren();
 for(const m of MODELS){const b=button(undefined,'plans-model');b.dataset.model=m.id;b.setAttribute('aria-pressed',String(m.id===model));const im=el('img');im.src=m.photo;im.alt='';im.width=100;im.height=70;const text=el('span',undefined,'plans-model-text');text.append(el('strong',m.name),el('small',plans.filter(p=>p.model===m.id).length+' схем'));b.append(im,text);b.addEventListener('click',()=>changeModel(m.id));models.append(b)}
 const all=root.querySelector('[data-model=all]');all.setAttribute('aria-pressed',String(model==='all'));
 const select=root.querySelector('#plans-size'),available=plans.filter(p=>model==='all'||p.model===model),sizes=[...new Map(available.map(p=>[sizeKey(p),p])).values()];select.replaceChildren();const option=el('option','Все размеры');option.value='all';select.append(option);
 for(const p of sizes){const o=el('option',dimensions(p));o.value=sizeKey(p);select.append(o)}select.value=size==='all'?'all':sizeKey(available.find(p=>sizeKey(p)===size));
 comparisonBar();const items=visible();root.querySelector('.plans-status').textContent=(model==='all'?'Все модели':modelName(model))+' · '+items.length+' схем';
 const grid=root.querySelector('.plans-grid');grid.replaceChildren();
 for(const p of items){const card=el('article',undefined,'plans-card');card.dataset.planId=p.id;card.dataset.model=p.model;
  const head=el('div',undefined,'plans-card-heading');if(model==='all')head.append(el('span',modelName(p.model),'plans-card-model'));const row=el('div',undefined,'plans-card-title');row.append(el('h2',dimensions(p)),el('span','Вариант '+p.variantNumber));head.append(row);card.append(head);
  const preview=button(undefined,'plans-preview');preview.setAttribute('aria-label','Открыть схему: '+label(p));const frame=el('span',undefined,'plans-thumbnail'),img=el('img');img.src='/'+p.image;img.alt=label(p);img.width=1620;img.height=1080;img.loading='lazy';img.decoding='async';frame.append(img);preview.append(frame);preview.addEventListener('click',()=>openPlan(p));
  const footer=el('div',undefined,'plans-card-actions'),open=button('Открыть ↗','plans-open'),request=button('Выбрать планировку','plans-card-request');open.addEventListener('click',()=>openPlan(p));request.addEventListener('click',()=>choose(p));const compareLabel=el('label',undefined,'r100-compare-check'),check=el('input');check.type='checkbox';check.dataset.comparePlan=p.id;check.checked=compared.has(p.id);check.disabled=compared.size===2&&!check.checked;check.addEventListener('change',()=>{check.checked?compared.add(p.id):compared.delete(p.id);draw()});compareLabel.append(check,document.createTextNode('Сравнить'));footer.append(open,request,compareLabel);card.append(preview,el('p',p.description,'r100-plan-description'),el('p',p.firebox,'r100-plan-firebox'),footer);grid.append(card)
 }
 if(focused)root.querySelector('[data-compare-plan="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
}
function openPlan(initial,initialMirror=false,fromURL=false){
 if(viewer){viewer.show(initial,initialMirror);return}
 const opener=document.activeElement,dialog=el('dialog',undefined,'plans-viewer');dialog.setAttribute('aria-labelledby','plans-viewer-title');let current=initial,mirror=initialMirror,zoomed=false;
 const top=el('div',undefined,'plans-viewer-top'),title=el('h2');title.id='plans-viewer-title';const close=button('Закрыть ×','plans-close');close.setAttribute('aria-label','Закрыть просмотр планировки');top.append(title,close);
 const models=el('nav',undefined,'plans-viewer-models');models.setAttribute('aria-label','Перейти к схемам другой модели');
 const stage=el('div',undefined,'plans-viewer-stage'),img=el('img');img.width=1620;img.height=1080;stage.tabIndex=0;stage.setAttribute('aria-label','Схема планировки');stage.append(img);
 const navigation=el('div',undefined,'plans-viewer-navigation'),prev=button('← Назад'),counter=el('span'),next=button('Далее →');prev.setAttribute('aria-label','Предыдущая планировка');next.setAttribute('aria-label','Следующая планировка');counter.setAttribute('aria-live','polite');navigation.append(prev,counter,next);
 const actions=el('div',undefined,'plans-viewer-actions'),flip=button('Зеркально'),zoom=button('Увеличить'),back=button('Все схемы модели'),request=button('Выбрать и рассчитать','plans-button plans-primary'),info=button('Задать вопрос о схеме');const description=el('div',undefined,'r100-plan-details');actions.append(flip,zoom,back,request,info);dialog.append(top,models,stage,navigation,description,actions);document.body.append(dialog);
 function list(){return visible()}
 function render(){
  analytics.track('dp_plan_view',{placement:'plans',model:current.model,plan_id:current.id,mirrored:mirror});description.replaceChildren(el('p',current.description),el('p',current.audience),el('p',current.firebox),el('p',current.note));
  title.textContent=label(current);img.src='/'+(mirror?current.mirrorImage:current.image);img.alt=label(current)+(mirror?' · зеркальная схема':' · основная схема');stage.classList.toggle('is-zoomed',zoomed);zoom.textContent=zoomed?'Вписать в окно':'Увеличить';zoom.setAttribute('aria-pressed',String(zoomed));flip.textContent=mirror?'Основная схема':'Зеркально';flip.setAttribute('aria-pressed',String(mirror));stage.scrollTop=stage.scrollLeft=0;
  const items=list(),index=items.findIndex(p=>p.id===current.id);counter.textContent=(index+1)+' из '+items.length;prev.disabled=index<=0;next.disabled=index>=items.length-1;models.replaceChildren();
  for(const m of MODELS){const b=button(m.name,'plans-viewer-model');b.dataset.model=m.id;b.setAttribute('aria-pressed',String(current.model===m.id));b.title='Все схемы · '+m.name;b.addEventListener('click',()=>{finish(true);changeModel(m.id)});models.append(b)}
  back.textContent='Все схемы · '+modelName(current.model);
 }
 function cleanup(){document.removeEventListener('keydown',keys);dialog.remove();viewer=null;if(opener?.isConnected)opener.focus({preventScroll:true})}
 function finish(fromPop=false){if(!dialog.open)return;dialog.close();cleanup();if(!fromPop)writeURL()}
 function step(delta){const items=list(),index=items.findIndex(p=>p.id===current.id)+delta;if(index<0||index>=items.length)return;current=items[index];mirror=false;zoomed=false;writeURL(current,mirror);render()}
 function keys(e){if(document.querySelector('.plan-request[open]')||(zoomed&&e.target===stage)||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();step(1)}else if(e.key==='ArrowLeft'){e.preventDefault();step(-1)}}
 viewer={close:finish,get plan(){return current},get mirror(){return mirror},show(p,m=false){current=p;mirror=m;zoomed=false;render()}};
 close.addEventListener('click',()=>finish());dialog.addEventListener('cancel',e=>{e.preventDefault();finish()});prev.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));flip.addEventListener('click',()=>{mirror=!mirror;analytics.track('dp_plan_mirror',{placement:'plans',model:current.model,plan_id:current.id,mirrored:mirror});writeURL(current,mirror);render()});zoom.addEventListener('click',()=>{zoomed=!zoomed;render()});back.addEventListener('click',()=>{finish(true);changeModel(current.model)});request.addEventListener('click',()=>choose(current,mirror));info.addEventListener('click',()=>openPlanInfoRequest(current,mirror));document.addEventListener('keydown',keys);
 if(!fromURL)writeURL(current,mirror,true);render();dialog.showModal();
}
function sync(){readURL();draw();const q=new URLSearchParams(location.search),p=plans.find(p=>p.id===q.get('plan'));if(p){if((model!=='all'&&model!==p.model)||!visible().some(x=>x.id===p.id)){model=p.model;size='all';draw();writeURL(p,q.get('mirror')==='1')}openPlan(p,q.get('mirror')==='1',true)}else viewer?.close(true)}
async function start(){
 try{const r=await fetch('/data/r94-layouts.json?v=r94-20261026',{cache:'no-cache'});if(!r.ok)throw Error('PLANS_UNAVAILABLE');const data=await r.json();plans=data.plans;root.replaceChildren();const controls=el('div',undefined,'plans-controls'),models=el('nav',undefined,'plans-models');models.setAttribute('aria-label','Модель бани');const filter=el('div',undefined,'plans-filter'),all=button('Все модели · '+plans.length,'plans-all');all.dataset.model='all';all.addEventListener('click',()=>changeModel('all'));const field=el('label',undefined,'plans-size-field'),text=el('span','Размер'),select=el('select');select.id='plans-size';select.setAttribute('aria-label','Размер бани');select.addEventListener('change',()=>{size=select.value;writeURL(null,false,true);draw();window.scrollTo({top:0,behavior:'instant'})});field.append(text,select);const status=el('span',undefined,'plans-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');filter.append(all,field,status);controls.append(models,filter);const grid=el('div',undefined,'plans-grid');grid.setAttribute('aria-label','Схемы планировок');root.append(controls,grid);sync();window.addEventListener('popstate',sync)}
 catch{root.prepend(el('p','Не удалось загрузить схемы. Обновите страницу или позвоните: +7 (951) 734-99-99.','plans-load-error'))}
}
if(root){start().then(()=>fetch('/data/site-settings.json',{cache:'no-cache'})).then(r=>r.ok?r.json():null).then(settings=>{if(settings){analytics.start(settings);writeURL(viewer?.plan||null,viewer?.mirror||false)}}).catch(()=>{})}
