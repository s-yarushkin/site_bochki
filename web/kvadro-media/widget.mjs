import {choosePhoto} from '../photo-choice.mjs?v=r100-20261027';
import {objects, layouts, referenceText, referenceLabel} from './content.mjs';
const asset = new URL('./assets/', import.meta.url);
const $=(s,root=document)=>root.querySelector(s);
const photoURL=(p,size=960)=>new URL(`photos/${p.id}-${size}.webp`,asset).href;
const planURL=p=>new URL(`plans/${p.id}.svg`,asset).href;
let object=objects[0],index=0,plan=layouts[1],opener=null;
const dialog=document.createElement('dialog');dialog.className='kq-dialog';dialog.id='kq-gallery';dialog.setAttribute('aria-labelledby','kq-gallery-title');
dialog.innerHTML=`<div class="kq-dialog-shell"><button type="button" class="kq-close" aria-label="Закрыть фотографии">×</button><div class="kq-object-tabs" role="group" aria-label="Исполнения Квадро"></div><div class="kq-gallery-stage"><button type="button" class="kq-photo-arrow" data-kq-step="-1" aria-label="Предыдущее фото">‹</button><img id="kq-gallery-image" width="720" height="960" alt=""><button type="button" class="kq-photo-arrow" data-kq-step="1" aria-label="Следующее фото">›</button></div><div class="kq-thumbs" role="group" aria-label="Фотографии выбранной бани"></div><div class="kq-gallery-caption"><div><p class="kq-gallery-counter" id="kq-gallery-counter" aria-live="polite"></p><h2 id="kq-gallery-title"></h2><p id="kq-gallery-caption"></p><p class="kq-gallery-note" id="kq-gallery-note"></p></div><button type="button" class="kq-button" data-kq-photo-inquiry>Выбрать эту баню как ориентир</button></div></div>`;
document.body.append(dialog);
const planDialog=document.createElement('dialog');planDialog.className='kq-dialog';planDialog.setAttribute('aria-label','Планировка Квадро крупно');
planDialog.innerHTML='<div class="kq-dialog-shell"><button type="button" class="kq-close" aria-label="Закрыть планировку">×</button><p class="kq-zoom-hint">Сдвигайте схему, чтобы рассмотреть детали.</p><div class="kq-plan-zoom-canvas"><img class="kq-plan-dialog-image" alt=""></div></div>';document.body.append(planDialog);
function drawPhoto(){
 const p=object.photos[index],im=$('#kq-gallery-image',dialog);im.src=photoURL(p,1600);im.alt=p.alt;
 $('#kq-gallery-title',dialog).textContent=object.title;$('#kq-gallery-caption',dialog).textContent=p.caption;
 $('#kq-gallery-counter',dialog).textContent=`${p.kind} · ${index+1} / ${object.photos.length}`;
 $('#kq-gallery-note',dialog).textContent=object.note||'Можно выбрать свои размеры, отделку и оснащение.';
 for(const b of dialog.querySelectorAll('[data-object]'))b.setAttribute('aria-pressed',String(b.dataset.object===object.id));
 const thumbs=$('.kq-thumbs',dialog);thumbs.replaceChildren(...object.photos.map((p,i)=>{const b=document.createElement('button');b.type='button';b.dataset.photo=String(i);b.setAttribute('aria-label',p.caption);b.setAttribute('aria-pressed',String(i===index));const im=document.createElement('img');im.src=photoURL(p,480);im.alt='';im.width=62;im.height=66;b.append(im);return b;}));
 for(const b of dialog.querySelectorAll('[data-kq-step]'))b.hidden=object.photos.length<2;
}
const tabs=$('.kq-object-tabs',dialog);tabs.hidden=objects.length<2;tabs.replaceChildren(...objects.map(o=>{const b=document.createElement('button');b.type='button';b.dataset.object=o.id;b.textContent=o.title;return b;}));
function openPhoto(id='timber-graphite',from=null,start=null){if(new URLSearchParams(location.search).get('work')===id)start??=new URLSearchParams(location.search).get('photo');object=objects.find(o=>o.id===id)||objects[0];index=Math.max(0,object.photos.findIndex(p=>p.id===start));opener=from||document.activeElement;drawPhoto();if(!dialog.open)dialog.showModal();}
dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.classList.contains('kq-close'))dialog.close();else if(b.dataset.object){object=objects.find(o=>o.id===b.dataset.object);index=0;drawPhoto();}else if(b.dataset.photo!==undefined){index=Number(b.dataset.photo);drawPhoto();}else if(b.dataset.kqStep){index=(index+Number(b.dataset.kqStep)+object.photos.length)%object.photos.length;drawPhoto();}else if(b.hasAttribute('data-kq-photo-inquiry'))choosePhoto('kvadro',object,object.photos[index]);});
dialog.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();index=(index+(e.key==='ArrowRight'?1:-1)+object.photos.length)%object.photos.length;drawPhoto();});
let touch=null;const stage=$('.kq-gallery-stage',dialog);stage.addEventListener('touchstart',e=>{touch=e.touches[0]?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});stage.addEventListener('touchend',e=>{if(!touch||!e.changedTouches[0])return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)<50||Math.abs(dy)>Math.abs(dx))return;index=(index+(dx<0?1:-1)+object.photos.length)%object.photos.length;drawPhoto();},{passive:true});
for(const d of [dialog,planDialog]){d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});d.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});}
$('.kq-close',planDialog).addEventListener('click',()=>planDialog.close());
function selectPlan(id){const next=layouts.find(p=>p.id===id);if(!next)return;plan=next;const im=$('#kq-plan-image');if(!im)return;im.src=planURL(plan);im.alt=`Планировка Квадро ${plan.size}, ${plan.title}`;for(const b of document.querySelectorAll('[data-kq-layout]'))b.setAttribute('aria-pressed',String(b.dataset.kqLayout===id));for(const [key,value] of [['tag',plan.tag],['title',plan.title],['size','Снаружи '+plan.size],['area','Внутри '+plan.floorArea],['text',plan.text]])$('#kq-plan-'+key).textContent=value;$('#kq-plan-features').replaceChildren(...plan.features.map(f=>{const li=document.createElement('li');li.textContent=f;return li;}));$('#kq-plan-custom').hidden=!plan.custom;}
function clearReference(){const f=$('#relay-lead-form');if(f)delete f.dataset.kvadroReference;const note=$('#kq-contact-reference');if(note){note.hidden=true;note.textContent='';}}
function setReference(id){const text=referenceText(id),f=$('#relay-lead-form'),contact=$('#contact-dialog');if(!text||!f||!contact)return;f.dataset.kvadroReference=id;let note=$('#kq-contact-reference');if(!note){note=document.createElement('p');note.id='kq-contact-reference';note.className='kq-reference-note';$('.dialog-intro',contact).insertAdjacentElement('afterend',note);}note.textContent=referenceLabel(id);note.hidden=false;}
function inquire(id){if(!referenceText(id))return;const trigger=$('[data-flow="callback"]');dialog.close();planDialog.close();if(trigger&&$('#contact-dialog')){trigger.click();setReference(id);}else{const u=new URL('/',location.href);u.searchParams.set('callback','help');u.searchParams.set('kvadroRef',id);u.hash='contact';location.assign(u.href);}}
document.addEventListener('click',e=>{
 const b=e.target.closest('button,a');if(!b)return;
 if(b.matches('[data-flow]'))clearReference();
 if(b.dataset.kqObject){e.preventDefault();openPhoto(b.dataset.kqObject,b,b.dataset.kqStart);}
 else if(b.matches('[data-gallery="kvadro"]')||(b.id==='config-zoom'&&$('#config-name')?.textContent.trim()==='Квадро')){e.preventDefault();e.stopImmediatePropagation();openPhoto('timber-graphite',b);}
 else if(b.dataset.kqLayout){selectPlan(b.dataset.kqLayout);}
 else if(b.hasAttribute('data-kq-enlarge')){opener=b;const im=$('img',planDialog);im.src=planURL(plan);im.alt=`${plan.title}, ${plan.size}`;planDialog.showModal();}
 else if(b.hasAttribute('data-kq-plan-inquiry')){inquire('plan-'+plan.id);}
},true);
const contact=$('#contact-dialog');if(contact)contact.addEventListener('close',clearReference);
const requested=new URLSearchParams(location.search).get('kvadroRef');if(referenceText(requested)){
 if(contact?.open)setReference(requested);
 else if(contact){const observer=new MutationObserver(()=>{if(contact.open){setReference(requested);observer.disconnect();}});observer.observe(contact,{attributes:true,attributeFilter:['open']});}
}
const configName=$('#config-name'),configLink=$('.kq-config-link');
if(configName&&configLink){const sync=()=>{const isParus=configName.textContent.trim()==='Квадро';configLink.hidden=!isParus;if(isParus){const im=$('#config-photo');if(im){im.src=photoURL(objects[0].photos[0],960);im.removeAttribute('srcset');im.alt=objects[0].photos[0].alt;}}};new MutationObserver(sync).observe(configName,{childList:true,characterData:true,subtree:true});sync();}
export {selectPlan,openPhoto};
