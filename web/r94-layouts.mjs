import {planLabel} from './r94-plan-labels.mjs?v=r94-20261026';
import {openPlanInfoRequest} from './r96-plan-request.mjs?v=r96-20261027';
const MODELS=[['kvadro','Квадро','/bani/kvadro/'],['viking','Викинг','/bani/viking/'],['parus','Парус','/bani/parus/'],['kvadro-house','Квадро Хаус','/bani/kvadro-haus/']];
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,cls='r94-button')=>{const n=el('button',text,cls);n.type='button';return n;};
const dimKey=p=>p.dimensions.lengthM+'x'+p.dimensions.widthM;
const number=n=>String(n).replace('.',',');
const dimensions=p=>number(p.dimensions.lengthM)+' × '+number(p.dimensions.widthM)+' м';
const roomText=n=>n+' '+(n===1?'помещение':n<5?'помещения':'помещений');
let pending,viewer,primary;
const load=()=>pending??=fetch('/data/r94-layouts.json?v=r94-20261026',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('LAYOUTS_UNAVAILABLE');return r.json()});
function keys(){return location.pathname.startsWith('/planirovki/')?{model:'model',size:'size',plan:'plan',mirror:'mirror'}:{model:'planModel',size:'planSize',plan:'viewPlan',mirror:'viewMirror'};}
function setURL(values,push=false){const u=new URL(location.href),k=keys();for(const [name,value]of Object.entries(values)){if(value===null||value==='')u.searchParams.delete(k[name]);else u.searchParams.set(k[name],value);}history[push?'pushState':'replaceState']({...history.state,r94Plans:true},'',u);}
function modelButtons(plans,current,change,includeAll=true){const nav=el('nav',undefined,'r94-models');nav.setAttribute('aria-label','Модель бани для планировок');const models=includeAll?[['all','Все модели',''],...MODELS]:MODELS;for(const [id,name]of models){const count=id==='all'?plans.length:plans.filter(p=>p.model===id).length;const b=button(undefined,'r94-model');b.dataset.model=id;b.setAttribute('aria-pressed',String(id===current));b.append(el('span',name),el('span',String(count),'r94-count'));b.addEventListener('click',()=>change(id));nav.append(b);}return nav;}
function createBrowser(root,data){
 const plans=MODELS.flatMap(([id])=>data.plans.filter(p=>p.model===id));const fallback=MODELS.some(([id])=>id===root.dataset.r93Plans)?root.dataset.r93Plans:'all';let model=fallback,size='all';const k=keys();
 const heading=el('div',undefined,'r94-browser-heading');heading.append(el('h2','Планировки бань'),el('p','Сравните схемы. Откройте любую крупно и запросите подробности в Telegram или MAX.'));
 const tools=el('div',undefined,'r94-tools'),navSlot=el('div'),sizes=el('div',undefined,'r94-sizes');sizes.setAttribute('role','group');sizes.setAttribute('aria-label','Размеры бани');const status=el('p',undefined,'r94-results');status.setAttribute('role','status');status.setAttribute('aria-live','polite');tools.append(navSlot,sizes,status);
 const grid=el('div',undefined,'r94-plan-grid');grid.setAttribute('aria-label','Доступные планировки');root.classList.add('r94-browser');root.replaceChildren(heading,tools,grid);root.append(el('p','На схемах показаны варианты расстановки. Запросите подробности о понравившейся планировке — пришлём их в выбранный мессенджер.','r94-disclosure'));
 function read(){const q=new URLSearchParams(location.search),m=q.get(k.model);model=m==='all'||MODELS.some(([id])=>id===m)?m:fallback;size=q.get(k.size)||'all';if(!plans.some(p=>(model==='all'||p.model===model)&&(dimKey(p)===size||p.size===size)))size='all';}
 function draw(){
  const focused=root.contains(document.activeElement)?{model:document.activeElement?.dataset?.model,size:document.activeElement?.dataset?.size}:{};
  const available=plans.filter(p=>model==='all'||p.model===model);navSlot.replaceChildren(modelButtons(plans,model,id=>{model=id;size='all';setURL({model,size,plan:null,mirror:null},true);draw();tools.scrollIntoView({block:'start'});}));
  sizes.replaceChildren();const all=button('Все размеры','r94-size');all.setAttribute('aria-pressed',String(size==='all'));all.dataset.size='all';all.addEventListener('click',()=>filterSize('all'));sizes.append(all);
  const unique=[...new Map(available.map(p=>[dimKey(p),p])).values()].sort((a,b)=>a.dimensions.lengthM-b.dimensions.lengthM||a.dimensions.widthM-b.dimensions.widthM);
  for(const p of unique){const b=button(dimensions(p),'r94-size');b.dataset.size=dimKey(p);b.setAttribute('aria-pressed',String(size===dimKey(p)||size===p.size));b.addEventListener('click',()=>filterSize(dimKey(p)));sizes.append(b);}
  const visible=available.filter(p=>size==='all'||dimKey(p)===size||p.size===size);grid.replaceChildren();status.textContent=(model==='all'?'Все модели':MODELS.find(([id])=>id===model)[1])+' · '+visible.length+' из '+available.length+' планировок';
  for(const p of visible){
   const card=el('article',undefined,'r94-plan-card');card.dataset.planId=p.id;card.dataset.model=p.model;
   const top=el('div',undefined,'r94-card-top');top.append(el('span',MODELS.find(([id])=>id===p.model)[1],'r94-model-name'),el('span','Вариант '+p.variantNumber,'r94-variant'));card.append(top,el('h3',dimensions(p)));
   const preview=button(undefined,'r94-plan-preview');preview.setAttribute('aria-label','Открыть: '+planLabel(p));const picture=el('span',undefined,'r94-plan-thumb'),img=el('img');img.src='/'+p.image;img.width=1620;img.height=1080;img.loading='lazy';img.decoding='async';img.alt=planLabel(p);picture.append(img);preview.append(picture,el('span','Открыть схему ↗','r94-view-label'));preview.addEventListener('click',()=>openPlan(p,false,{browser:api,visible}));card.append(preview);
   const foot=el('div',undefined,'r94-card-footer');foot.append(el('span',roomText(p.rooms),'r94-room-count'));const pick=button('Получить подробности','r94-card-pick');pick.addEventListener('click',()=>openPlanInfoRequest(p,false));foot.append(pick);card.append(foot);grid.append(card);
  }
  if(focused.model)navSlot.querySelector('[data-model="'+focused.model+'"]')?.focus({preventScroll:true});else if(focused.size)sizes.querySelector('[data-size="'+focused.size+'"]')?.focus({preventScroll:true});
 }
 function filterSize(value){size=value;setURL({model,size,plan:null,mirror:null},true);draw();tools.scrollIntoView({block:'start'});}
 const api={root,plans,get model(){return model},get size(){return size},get visible(){return plans.filter(p=>(model==='all'||p.model===model)&&(size==='all'||dimKey(p)===size||p.size===size))},showModel(id){model=id;size='all';draw();},sync(){read();draw();}};read();draw();return api;
}
export async function openPlan(plan,initialMirror=false,options={}){
 const data=await load();plan=data.plans.find(p=>p.id===plan.id)||plan;if(viewer){viewer.show(plan,initialMirror);return;}
 const opener=document.activeElement,browser=options.browser||primary;let current=plan,mirror=initialMirror,list=options.visible||browser?.visible||data.plans.filter(p=>p.model===plan.model),model=browser?.model||plan.model,zoomed=false;const managedEntry=!options.fromURL;
 if(!list.some(p=>p.id===plan.id))list=data.plans.filter(p=>p.model===plan.model);
 const dialog=el('dialog',undefined,'r94-viewer r95-viewer');dialog.setAttribute('aria-labelledby','r94-viewer-title');const top=el('div',undefined,'r94-viewer-top'),title=el('h2',undefined);title.id='r94-viewer-title';const close=button('Закрыть просмотр ×','r94-close');close.setAttribute('aria-label','Закрыть просмотр планировки');top.append(title,close);const models=el('div',undefined,'r94-viewer-models');
 const stage=el('div',undefined,'r94-viewer-stage'),img=el('img');stage.tabIndex=0;stage.setAttribute('aria-label','Область схемы');img.width=1620;img.height=1080;stage.append(img);
 const navigation=el('div',undefined,'r94-viewer-navigation'),prev=button('← Предыдущая'),counter=el('span',undefined,'r94-viewer-counter'),next=button('Следующая →');prev.setAttribute('aria-label','Предыдущая планировка');next.setAttribute('aria-label','Следующая планировка');counter.setAttribute('aria-live','polite');navigation.append(prev,counter,next);
 const actions=el('div',undefined,'r94-viewer-actions'),flip=button('Зеркально'),zoom=button('Увеличить схему'),share=button('Скопировать ссылку'),pick=button('Пришлите подробности','r94-button r94-button-primary');actions.append(flip,zoom,share,pick);
 const back=button('Все планировки','r94-button r95-back-to-plans');back.addEventListener('click',()=>returnToList(current.model));actions.insertBefore(back,pick);
 const facts=el('p',undefined,'r94-viewer-facts');dialog.append(top,models,stage,navigation,actions,facts);document.body.append(dialog);
 function syncURL(push=false){setURL({model:browser?.model||current.model,size:browser?.size||'all',plan:current.id,mirror:mirror?'1':null},push);}
 function draw(){
  const focusedModel=models.contains(document.activeElement)?document.activeElement?.dataset?.model:null;
  title.textContent=planLabel(current);dialog.setAttribute('aria-label',planLabel(current));img.src='/'+(mirror?current.mirrorImage:current.image);img.alt=planLabel(current)+(mirror?' · зеркально':' · основная схема');flip.textContent=mirror?'Основная схема':'Зеркально';flip.setAttribute('aria-pressed',String(mirror));zoom.textContent=zoomed?'Вписать в окно':'Увеличить схему';zoom.setAttribute('aria-pressed',String(zoomed));stage.classList.toggle('is-zoomed',zoomed);
  const index=list.findIndex(p=>p.id===current.id);counter.textContent=(index+1)+' из '+list.length;prev.disabled=index<=0;next.disabled=index>=list.length-1;
  models.replaceChildren(modelButtons(data.plans,model,returnToList));
  for(const b of models.querySelectorAll('[data-model]'))b.title='Открыть список планировок';
  const modelName=MODELS.find(([id])=>id===current.model)?.[1]||'';const modelCount=data.plans.filter(p=>p.model===current.model).length;back.textContent='Все '+modelCount+' схем · '+modelName;
  stage.scrollTop=0;stage.scrollLeft=0;
  facts.textContent=roomText(current.rooms)+'. '+current.firebox+' Состав и стоимость — по выбранной комплектации.';
  if(focusedModel)models.querySelector('[data-model="'+focusedModel+'"]')?.focus({preventScroll:true});
 }
 function returnToList(id){
  if(browser){browser.showModel(id);finish(true);setURL({model:id,size:'all',plan:null,mirror:null});browser.root.scrollIntoView({block:'start'});browser.root.querySelector('[data-model="'+id+'"]')?.focus({preventScroll:true});}
  else {finish(true);const u=new URL('/planirovki/',location.href);u.searchParams.set('model',id);location.href=u.pathname+u.search;}
 }
 function go(delta){const index=list.findIndex(p=>p.id===current.id)+delta;if(index<0||index>=list.length)return;current=list[index];mirror=false;zoomed=false;syncURL();draw();}
 function cleanup(){document.removeEventListener('keydown',onKey);dialog.remove();viewer=null;if(opener?.isConnected)opener.focus({preventScroll:true});else browser?.root.querySelector('.r94-model[aria-pressed=true]')?.focus({preventScroll:true});}
 function finish(fromPop=false){if(!dialog.open)return;dialog.close();cleanup();if(!fromPop){setURL({plan:null,mirror:null,model:browser?.model||current.model,size:browser?.size||'all'});}}
 function onKey(e){if(zoomed&&e.target===stage)return;if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();go(1)}else if(e.key==='ArrowLeft'){e.preventDefault();go(-1)}}
 viewer={close:finish,show(p,m=false){current=data.plans.find(x=>x.id===p.id)||p;mirror=m;if(!list.some(x=>x.id===current.id)){model=current.model;list=data.plans.filter(x=>x.model===model)}draw();}};
 close.addEventListener('click',()=>finish());dialog.addEventListener('cancel',e=>{e.preventDefault();finish()});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)finish()}});
 prev.addEventListener('click',()=>go(-1));next.addEventListener('click',()=>go(1));flip.addEventListener('click',()=>{mirror=!mirror;syncURL();draw()});zoom.addEventListener('click',()=>{zoomed=!zoomed;draw()});pick.addEventListener('click',()=>openPlanInfoRequest(current,mirror));
 share.addEventListener('click',async()=>{const u=new URL('/planirovki/',location.href);u.searchParams.set('model',current.model);u.searchParams.set('plan',current.id);if(mirror)u.searchParams.set('mirror','1');try{await navigator.clipboard.writeText(u.href);share.textContent='Ссылка скопирована'}catch{const input=el('input');input.readOnly=true;input.value=u.href;share.after(input);input.select();share.textContent='Ссылка рядом'}});
 document.addEventListener('keydown',onKey);if(managedEntry)syncURL(true);draw();dialog.showModal();
}
async function syncFromURL(){const k=keys(),q=new URLSearchParams(location.search);primary?.sync();const id=q.get(k.plan);if(!id){viewer?.close(true);return;}const data=await load(),plan=data.plans.find(p=>p.id===id);if(!plan)return;if(viewer)viewer.show(plan,q.get(k.mirror)==='1');else await openPlan(plan,q.get(k.mirror)==='1',{browser:primary,fromURL:true});}
async function start(){const roots=[...document.querySelectorAll('[data-r93-plans]')];if(!roots.length)return;try{const data=await load();for(const root of roots){const api=createBrowser(root,data);primary??=api;}await syncFromURL();}catch{for(const root of roots){root.replaceChildren(el('p','Не удалось загрузить схемы. Обновите страницу или позвоните: +7 (951) 734-99-99.'));}}}
window.addEventListener('popstate',syncFromURL);document.addEventListener('dp:r93-open-plan',async e=>{const data=await load(),p=data.plans.find(x=>x.id===e.detail.id);if(p)openPlan(p,e.detail.mirror)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
