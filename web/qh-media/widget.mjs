import {choosePhoto} from '../photo-choice.mjs?v=r100-20261027';
import {objects, layouts, referenceText, referenceLabel} from './content.mjs';
const asset = new URL('./assets/', import.meta.url);
const $=(s,root=document)=>root.querySelector(s);
const photoURL=(p,size=960)=>new URL(`photos/${p.id}-${size}.webp`,asset).href;
const planURL=p=>new URL(`plans/${p.id}.svg`,asset).href;
let object=objects[0],index=0,plan=layouts[1],opener=null;
const dialog=document.createElement('dialog');dialog.className='qh-dialog';dialog.id='qh-gallery';dialog.setAttribute('aria-labelledby','qh-gallery-title');
dialog.innerHTML=`<div class="qh-dialog-shell"><button type="button" class="qh-close" aria-label="Закрыть фотографии">×</button><div class="qh-object-tabs" role="group" aria-label="Исполнения Квадро Хаус"></div><div class="qh-gallery-stage"><button type="button" class="qh-photo-arrow" data-qh-step="-1" aria-label="Предыдущее фото">‹</button><img id="qh-gallery-image" width="720" height="960" alt=""><button type="button" class="qh-photo-arrow" data-qh-step="1" aria-label="Следующее фото">›</button></div><div class="qh-thumbs" role="group" aria-label="Фотографии выбранной бани"></div><div class="qh-gallery-caption"><div><p class="qh-gallery-counter" id="qh-gallery-counter" aria-live="polite"></p><h2 id="qh-gallery-title"></h2><p id="qh-gallery-caption"></p><p class="qh-gallery-note" id="qh-gallery-note"></p></div><button type="button" class="qh-button" data-qh-photo-inquiry>Выбрать эту баню как ориентир</button></div></div>`;
document.body.append(dialog);
const planDialog=document.createElement('dialog');planDialog.className='qh-dialog';planDialog.setAttribute('aria-label','Планировка Квадро Хаус крупно');
planDialog.innerHTML='<div class="qh-dialog-shell"><button type="button" class="qh-close" aria-label="Закрыть планировку">×</button><p class="qh-zoom-hint">Сдвигайте схему, чтобы рассмотреть детали.</p><div class="qh-plan-zoom-canvas"><img class="qh-plan-dialog-image" alt=""></div></div>';document.body.append(planDialog);
function drawPhoto(){
 const p=object.photos[index],im=$('#qh-gallery-image',dialog);im.src=photoURL(p,1600);im.alt=p.alt;
 $('#qh-gallery-title',dialog).textContent=object.title;$('#qh-gallery-caption',dialog).textContent=p.caption;
 $('#qh-gallery-counter',dialog).textContent=`${p.kind} · ${index+1} / ${object.photos.length}`;
 $('#qh-gallery-note',dialog).textContent=object.note||'Можно выбрать свои размеры, отделку и оснащение.';
 for(const b of dialog.querySelectorAll('[data-object]'))b.setAttribute('aria-pressed',String(b.dataset.object===object.id));
 const thumbs=$('.qh-thumbs',dialog);thumbs.replaceChildren(...object.photos.map((p,i)=>{const b=document.createElement('button');b.type='button';b.dataset.photo=String(i);b.setAttribute('aria-label',p.caption);b.setAttribute('aria-pressed',String(i===index));const im=document.createElement('img');im.src=photoURL(p,480);im.alt='';im.width=62;im.height=66;b.append(im);return b;}));
 for(const b of dialog.querySelectorAll('[data-qh-step]'))b.hidden=object.photos.length<2;
}
const tabs=$('.qh-object-tabs',dialog);tabs.replaceChildren(...objects.map(o=>{const b=document.createElement('button');b.type='button';b.dataset.object=o.id;b.setAttribute('aria-label','Квадро Хаус: '+o.title);const im=document.createElement('img');im.src=photoURL(o.photos[0],480);im.alt='';im.width=45;im.height=51;im.loading='lazy';const label=document.createElement('span');label.textContent=o.title;b.append(im,label);return b;}));
function openPhoto(id='terrace-window',from=null,start=null){if(new URLSearchParams(location.search).get('work')===id)start??=new URLSearchParams(location.search).get('photo');object=objects.find(o=>o.id===id)||objects[0];index=Math.max(0,object.photos.findIndex(p=>p.id===start));opener=from||document.activeElement;drawPhoto();if(!dialog.open)dialog.showModal();}
dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.classList.contains('qh-close'))dialog.close();else if(b.dataset.object){object=objects.find(o=>o.id===b.dataset.object);index=0;drawPhoto();}else if(b.dataset.photo!==undefined){index=Number(b.dataset.photo);drawPhoto();}else if(b.dataset.qhStep){index=(index+Number(b.dataset.qhStep)+object.photos.length)%object.photos.length;drawPhoto();}else if(b.hasAttribute('data-qh-photo-inquiry'))choosePhoto('kvadro-house',object,object.photos[index]);});
dialog.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();index=(index+(e.key==='ArrowRight'?1:-1)+object.photos.length)%object.photos.length;drawPhoto();});
let touch=null;const stage=$('.qh-gallery-stage',dialog);stage.addEventListener('touchstart',e=>{touch=e.touches[0]?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});stage.addEventListener('touchend',e=>{if(!touch||!e.changedTouches[0])return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)<50||Math.abs(dy)>Math.abs(dx))return;index=(index+(dx<0?1:-1)+object.photos.length)%object.photos.length;drawPhoto();},{passive:true});
for(const d of [dialog,planDialog]){d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});d.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});}
$('.qh-close',planDialog).addEventListener('click',()=>planDialog.close());
function selectPlan(id){const next=layouts.find(p=>p.id===id);if(!next)return;plan=next;const im=$('#qh-plan-image');if(!im)return;im.src=planURL(plan);im.alt=`Планировка Квадро Хаус ${plan.size}, ${plan.title}`;for(const b of document.querySelectorAll('[data-qh-layout]'))b.setAttribute('aria-pressed',String(b.dataset.qhLayout===id));for(const [key,value] of [['tag',plan.tag],['title',plan.title],['size','Снаружи '+plan.size],['area','Внутри '+plan.floorArea],['text',plan.text]])$('#qh-plan-'+key).textContent=value;$('#qh-plan-features').replaceChildren(...plan.features.map(f=>{const li=document.createElement('li');li.textContent=f;return li;}));$('#qh-plan-custom').hidden=!plan.custom;}
function clearReference(){const f=$('#relay-lead-form');if(f)delete f.dataset.qhReference;const note=$('#qh-contact-reference');if(note){note.hidden=true;note.textContent='';}}
function setReference(id){const text=referenceText(id),f=$('#relay-lead-form'),contact=$('#contact-dialog');if(!text||!f||!contact)return;f.dataset.qhReference=id;let note=$('#qh-contact-reference');if(!note){note=document.createElement('p');note.id='qh-contact-reference';note.className='qh-reference-note';$('.dialog-intro',contact).insertAdjacentElement('afterend',note);}note.textContent=referenceLabel(id);note.hidden=false;}
function inquire(id){if(!referenceText(id))return;const trigger=$('[data-flow="callback"]');dialog.close();planDialog.close();if(trigger&&$('#contact-dialog')){trigger.click();setReference(id);}else{const u=new URL('/',location.href);u.searchParams.set('callback','help');u.searchParams.set('qhRef',id);u.hash='contact';location.assign(u.href);}}
document.addEventListener('click',e=>{
 const b=e.target.closest('button,a');if(!b)return;
 if(b.matches('[data-flow]'))clearReference();
 if(b.dataset.qhObject){e.preventDefault();openPhoto(b.dataset.qhObject,b,b.dataset.qhStart);}
 else if(b.matches('[data-gallery="kvadro-house"]')||(b.id==='config-zoom'&&$('#config-name')?.textContent.trim()==='Квадро Хаус')){e.preventDefault();e.stopImmediatePropagation();openPhoto('terrace-window',b);}
 else if(b.dataset.qhLayout){selectPlan(b.dataset.qhLayout);}
 else if(b.hasAttribute('data-qh-enlarge')){opener=b;const im=$('img',planDialog);im.src=planURL(plan);im.alt=`${plan.title}, ${plan.size}`;planDialog.showModal();}
 else if(b.hasAttribute('data-qh-plan-inquiry')){inquire('plan-'+plan.id);}
},true);
const contact=$('#contact-dialog');if(contact)contact.addEventListener('close',clearReference);
const requested=new URLSearchParams(location.search).get('qhRef');if(referenceText(requested)){
 if(contact?.open)setReference(requested);
 else if(contact){const observer=new MutationObserver(()=>{if(contact.open){setReference(requested);observer.disconnect();}});observer.observe(contact,{attributes:true,attributeFilter:['open']});}
}
const configName=$('#config-name'),configLink=$('.qh-config-link');
if(configName&&configLink){const sync=()=>{const isParus=configName.textContent.trim()==='Квадро Хаус';configLink.hidden=!isParus;if(isParus){const im=$('#config-photo');if(im){im.src=photoURL(objects[0].photos[0],960);im.removeAttribute('srcset');im.alt=objects[0].photos[0].alt;}}};new MutationObserver(sync).observe(configName,{childList:true,characterData:true,subtree:true});sync();}
export {selectPlan,openPhoto};
