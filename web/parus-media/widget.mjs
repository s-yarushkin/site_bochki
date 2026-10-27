import {choosePhoto} from '../photo-choice.mjs?v=r100-20261027';
import {objects, layouts, referenceText, referenceLabel} from './content.mjs';
const asset = new URL('./assets/', import.meta.url);
const $=(s,root=document)=>root.querySelector(s);
const photoURL=(p,size=960)=>new URL(`photos/${p.id}-${size}.webp`,asset).href;
const planURL=p=>new URL(`plans/${p.id}.svg`,asset).href;
let photoRequest=0;
// An exact element-specific guard: never resize thumbnails or layout diagrams.
function enforceStageGeometry(){
 const im=$('#pp-gallery-image',dialog), stage=$('.pp-gallery-stage',dialog);
 if(!dialog.open || !im || !stage) return 'NOT_OPEN';
 const sr=stage.getBoundingClientRect(),r=im.getBoundingClientRect();
 if(sr.width<240 || sr.height<180) return 'STAGE_UNMEASURABLE';
 const imageTooSmall=(r.width<sr.width*.42 || r.height<sr.height*.42 || r.width<160 || r.height<180);
 if(!imageTooSmall){im.dataset.ppGeometry='ok';return 'PASS';}
 // Works even if earlier site-wide CSS applied width/height/transform !important to img.
 for(const [name,value] of [['display','block'],['width','100%'],['height','100%'],['min-width','0'],['max-width','none'],['max-height','none'],['object-fit','contain'],['transform','none'],['margin','0'],['grid-column','2'],['justify-self','stretch'],['align-self','stretch']])im.style.setProperty(name,value,'important');
 const after=im.getBoundingClientRect();
 const ok=after.width>=sr.width*.42 && after.height>=sr.height*.42 && after.width>=160 && after.height>=180;
 im.dataset.ppGeometry=ok?'repaired':'failed';
 if(!ok)console.warn('Parus gallery: main photo stage geometry not recovered', {stage:[sr.width,sr.height],before:[r.width,r.height],after:[after.width,after.height]});
 return ok?'REPAIRED':'FAILED';
}
function scheduleGeometry(){requestAnimationFrame(()=>{enforceStageGeometry();});}

let object=objects[1],index=0,plan=layouts[1],opener=null;
const dialog=document.createElement('dialog');dialog.className='pp-dialog';dialog.id='pp-gallery';dialog.setAttribute('aria-labelledby','pp-gallery-title');
dialog.innerHTML=`<div class="pp-dialog-shell"><button type="button" class="pp-close" aria-label="Закрыть фотографии">×</button><p class="pp-dialog-eyebrow">Парус · Примеры выполненных работ</p><div class="pp-object-tabs" role="group" aria-label="Исполнения Паруса"></div><div class="pp-gallery-stage"><button type="button" class="pp-photo-arrow" data-pp-step="-1" aria-label="Предыдущее фото">‹</button><img id="pp-gallery-image" width="720" height="960" alt=""><button type="button" class="pp-photo-arrow" data-pp-step="1" aria-label="Следующее фото">›</button></div><div class="pp-thumbs" role="group" aria-label="Фотографии выбранной бани"></div><div class="pp-gallery-caption"><div><p class="pp-gallery-counter" id="pp-gallery-counter" aria-live="polite"></p><h2 id="pp-gallery-title"></h2><p id="pp-gallery-caption"></p><p class="pp-gallery-note" id="pp-gallery-note"></p></div><button type="button" class="pp-button" data-pp-photo-inquiry>Выбрать эту баню как ориентир</button></div></div>`;
document.body.append(dialog);
const planDialog=document.createElement('dialog');planDialog.className='pp-dialog';planDialog.setAttribute('aria-label','Планировка Паруса крупно');
planDialog.innerHTML='<div class="pp-dialog-shell"><button type="button" class="pp-close" aria-label="Закрыть планировку">×</button><p class="pp-zoom-hint">Сдвигайте схему, чтобы рассмотреть детали.</p><div class="pp-plan-zoom-canvas"><img class="pp-plan-dialog-image" alt=""></div></div>';document.body.append(planDialog);
function drawPhoto(){
 const p=object.photos[index],im=$('#pp-gallery-image',dialog),token=++photoRequest;
 im.alt=p.alt;im.dataset.ppGeometry='pending';im.dataset.ppAsset='full';
 im.onerror=()=>{
   if(token!==photoRequest)return;
   if(im.dataset.ppAsset==='full') {im.dataset.ppAsset='fallback';im.src=photoURL(p,960);return;}
   im.dataset.ppAsset='missing';im.alt='Фотография недоступна: '+p.caption;
   console.warn('Parus gallery: photo missing', p.id);
 };
 im.onload=()=>{if(token!==photoRequest)return;scheduleGeometry();};
 im.src=photoURL(p,1600);
 scheduleGeometry();
 $('#pp-gallery-title',dialog).textContent=object.title;$('#pp-gallery-caption',dialog).textContent=p.caption;
 $('#pp-gallery-counter',dialog).textContent=`${p.kind} · ${index+1} / ${object.photos.length}`;
 $('#pp-gallery-note',dialog).textContent=object.note||'Можно выбрать свои размеры, отделку и оснащение.';
 for(const b of dialog.querySelectorAll('[data-object]'))b.setAttribute('aria-pressed',String(b.dataset.object===object.id));
 const thumbs=$('.pp-thumbs',dialog);thumbs.replaceChildren(...object.photos.map((p,i)=>{const b=document.createElement('button');b.type='button';b.dataset.photo=String(i);b.setAttribute('aria-label',p.caption);b.setAttribute('aria-pressed',String(i===index));const im=document.createElement('img');im.src=photoURL(p,480);im.alt='';im.width=62;im.height=66;b.append(im);return b;}));
 for(const b of dialog.querySelectorAll('[data-pp-step]'))b.hidden=object.photos.length<2;
}
const tabs=$('.pp-object-tabs',dialog);tabs.replaceChildren(...objects.map(o=>{
 const b=document.createElement('button');b.type='button';b.dataset.object=o.id;b.setAttribute('aria-label','Парус: '+o.title);
 const preview=document.createElement('img');preview.src=photoURL(o.photos[0],480);preview.alt='';preview.loading='lazy';preview.width=54;preview.height=60;
 const label=document.createElement('span');label.textContent=o.title;b.append(preview,label);return b;
}));
function openPhoto(id='slats',from=null){const start=new URLSearchParams(location.search).get('work')===id?new URLSearchParams(location.search).get('photo'):null;object=objects.find(o=>o.id===id)||objects[1];index=Math.max(0,object.photos.findIndex(p=>p.id===start));opener=from||document.activeElement;drawPhoto();if(!dialog.open)dialog.showModal();scheduleGeometry();}
dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.classList.contains('pp-close'))dialog.close();else if(b.dataset.object){object=objects.find(o=>o.id===b.dataset.object);index=0;drawPhoto();}else if(b.dataset.photo!==undefined){index=Number(b.dataset.photo);drawPhoto();}else if(b.dataset.ppStep){index=(index+Number(b.dataset.ppStep)+object.photos.length)%object.photos.length;drawPhoto();}else if(b.hasAttribute('data-pp-photo-inquiry'))choosePhoto('parus',object,object.photos[index]);});
dialog.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();index=(index+(e.key==='ArrowRight'?1:-1)+object.photos.length)%object.photos.length;drawPhoto();});
let touch=null;const stage=$('.pp-gallery-stage',dialog);stage.addEventListener('touchstart',e=>{touch=e.touches[0]?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});stage.addEventListener('touchend',e=>{if(!touch||!e.changedTouches[0])return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)<50||Math.abs(dy)>Math.abs(dx))return;index=(index+(dx<0?1:-1)+object.photos.length)%object.photos.length;drawPhoto();},{passive:true});
for(const d of [dialog,planDialog]){d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});d.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});}
$('.pp-close',planDialog).addEventListener('click',()=>planDialog.close());
function selectPlan(id){const next=layouts.find(p=>p.id===id);if(!next)return;plan=next;const im=$('#pp-plan-image');if(!im)return;im.src=planURL(plan);im.alt=`Планировка Паруса ${plan.size}, ${plan.title}`;for(const b of document.querySelectorAll('[data-pp-layout]'))b.setAttribute('aria-pressed',String(b.dataset.ppLayout===id));for(const [key,value] of [['tag',plan.tag],['title',plan.title],['size','Снаружи '+plan.size],['area','Внутри '+plan.floorArea],['text',plan.text]])$('#pp-plan-'+key).textContent=value;$('#pp-plan-features').replaceChildren(...plan.features.map(f=>{const li=document.createElement('li');li.textContent=f;return li;}));$('#pp-plan-custom').hidden=!plan.custom;}
function clearReference(){const f=$('#relay-lead-form');if(f)delete f.dataset.parusReference;const note=$('#pp-contact-reference');if(note){note.hidden=true;note.textContent='';}}
function setReference(id){const text=referenceText(id),f=$('#relay-lead-form'),contact=$('#contact-dialog');if(!text||!f||!contact)return;f.dataset.parusReference=id;let note=$('#pp-contact-reference');if(!note){note=document.createElement('p');note.id='pp-contact-reference';note.className='pp-reference-note';$('.dialog-intro',contact).insertAdjacentElement('afterend',note);}note.textContent=referenceLabel(id);note.hidden=false;}
function inquire(id){if(!referenceText(id))return;const trigger=$('[data-flow="callback"]');dialog.close();planDialog.close();if(trigger&&$('#contact-dialog')){trigger.click();setReference(id);}else{const u=new URL('/',location.href);u.searchParams.set('callback','help');u.searchParams.set('parusRef',id);u.hash='contact';location.assign(u.href);}}
document.addEventListener('click',e=>{
 const b=e.target.closest('button,a');if(!b)return;
 if(b.matches('[data-flow]'))clearReference();
 if(b.dataset.ppObject){e.preventDefault();openPhoto(b.dataset.ppObject,b);}
 else if(b.matches('[data-gallery="parus"]')||(b.id==='config-zoom'&&$('#config-name')?.textContent.trim()==='Парус')){e.preventDefault();e.stopImmediatePropagation();openPhoto('slats',b);}
 else if(b.dataset.ppLayout){selectPlan(b.dataset.ppLayout);}
 else if(b.hasAttribute('data-pp-enlarge')){opener=b;const im=$('img',planDialog);im.src=planURL(plan);im.alt=`${plan.title}, ${plan.size}`;planDialog.showModal();}
 else if(b.hasAttribute('data-pp-plan-inquiry')){inquire('plan-'+plan.id);}
},true);
const contact=$('#contact-dialog');if(contact)contact.addEventListener('close',clearReference);
const requested=new URLSearchParams(location.search).get('parusRef');if(referenceText(requested)){
 if(contact?.open)setReference(requested);
 else if(contact){const observer=new MutationObserver(()=>{if(contact.open){setReference(requested);observer.disconnect();}});observer.observe(contact,{attributes:true,attributeFilter:['open']});}
}
const configName=$('#config-name'),configLink=$('.pp-config-link');
if(configName&&configLink){const sync=()=>{const isParus=configName.textContent.trim()==='Парус';configLink.hidden=!isParus;if(isParus){const im=$('#config-photo');if(im){im.src=photoURL(objects[1].photos[0],960);im.removeAttribute('srcset');im.alt=objects[1].photos[0].alt;}}};new MutationObserver(sync).observe(configName,{childList:true,characterData:true,subtree:true});sync();}
export {selectPlan,openPhoto};
