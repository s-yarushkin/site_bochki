/** Dacha Par model-scoped gallery. Does not touch pricing, forms, MAX or manager auth. */
const SELECTOR = '[data-gallery]';
const DATA_URL = new URL('./catalog.json', import.meta.url);
let catalogPromise;
let current = null;
let focusReturn = null;
let dialog = null;
let imageRequest = 0;
let startTouch = null;

const SCENE_LABEL = Object.freeze({all:'Все ракурсы',outside:'Снаружи',steam:'Парная',lounge:'Комната отдыха',inside:'Внутри',detail:'Детали'});

function safeModel(model) {
  return typeof model === 'string' && /^[a-z][a-z-]{2,40}$/.test(model);
}
function loadCatalog() {
  if (!catalogPromise) catalogPromise = fetch(DATA_URL, {credentials:'same-origin'})
    .then(r => {if(!r.ok) throw Error('Gallery data HTTP '+r.status);return r.json();})
    .then(data => {if(data.schemaVersion !== 1 || !data.models) throw Error('Gallery manifest invalid');return data.models;});
  return catalogPromise;
}
function button(text, className, ariaLabel) {
  const b=document.createElement('button');b.type='button';b.className=className;b.textContent=text;
  if(ariaLabel)b.setAttribute('aria-label',ariaLabel);return b;
}
function element(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
function createDialog() {
  const d=element('dialog');d.id='dp-gallery-v2';d.setAttribute('aria-labelledby','dp-gallery-v2-title');
  const shell=element('div','dp-shell');
  const head=element('header','dp-head'), titles=element('div');
  const eyebrow=element('p','dp-eyebrow');eyebrow.textContent='Коллекция · фотографии';
  const title=element('h2');title.id='dp-gallery-v2-title';titles.append(eyebrow,title);
  const close=button('×','dp-close','Закрыть галерею');close.dataset.action='close';head.append(titles,close);
  const groups=element('div','dp-groups');groups.setAttribute('aria-label','Примеры модели');
  const scenes=element('div','dp-scene-list');scenes.setAttribute('aria-label','Ракурсы');
  const stage=element('div','dp-stage');stage.id='dp-gallery-v2-stage';
  const photo=element('img','dp-main-image');photo.alt='';photo.decoding='async';
  const failed=element('p','dp-image-status');failed.hidden=true;failed.textContent='Фотография недоступна. Можно выбрать другой ракурс.';
  const prev=button('‹','dp-photo-nav prev','Предыдущая фотография'), next=button('›','dp-photo-nav next','Следующая фотография');prev.dataset.action='prev';next.dataset.action='next';
  stage.append(photo,failed,prev,next);
  const meta=element('div','dp-meta'), caption=element('span'),counter=element('span');counter.setAttribute('aria-live','polite');meta.append(caption,counter);
  const thumbs=element('div','dp-thumbs');thumbs.setAttribute('aria-label','Миниатюры выбранного примера');
  const bottom=element('div','dp-bottom'), disclaimer=element('p','dp-disclaimer');
  disclaimer.textContent='Фотографии показывают внешнее исполнение модели. Планировки, размеры и цены выбираются отдельно.';
  const cta=element('a','dp-cta');cta.textContent='Выбрать модель';bottom.append(disclaimer,cta);
  shell.append(head,groups,scenes,stage,meta,thumbs,bottom);d.append(shell);document.body.append(d);
  const state={d,title,groups,scenes,stage,photo,failed,prev,next,caption,counter,thumbs,cta};
  d.addEventListener('click',e=>{
    if(e.target===d){d.close();return;}
    const action=e.target.closest('[data-action]');if(action){
      if(action.dataset.action==='close')d.close();
      if(action.dataset.action==='prev')move(-1);
      if(action.dataset.action==='next')move(1);
    }
    const chooseGroup=e.target.closest('[data-group-id]');if(chooseGroup && current){current.groupId=chooseGroup.dataset.groupId;current.scene='all';current.index=0;render();}
    const chooseScene=e.target.closest('[data-scene-id]');if(chooseScene && current){current.scene=chooseScene.dataset.sceneId;current.index=0;render();}
    const choosePhoto=e.target.closest('[data-photo-index]');if(choosePhoto&&current){current.index=Number(choosePhoto.dataset.photoIndex);render();}
  });
  d.addEventListener('keydown',e=>{
    if(e.key==='ArrowRight'){e.preventDefault();move(1);}else if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}
  });
  stage.addEventListener('touchstart',e=>{startTouch=e.touches[0]?.clientX??null;},{passive:true});
  stage.addEventListener('touchend',e=>{
    if(startTouch===null)return;const shift=(e.changedTouches[0]?.clientX??startTouch)-startTouch;startTouch=null;
    if(Math.abs(shift)>55)move(shift<0?1:-1);
  },{passive:true});
  d.addEventListener('close',()=>{imageRequest++;current=null;if(focusReturn?.isConnected)focusReturn.focus();focusReturn=null;});
  return state;
}
function photosForGroup(group,scene){return group.photos.filter(p=>scene==='all'||p.scene===scene);}
function chosen(){if(!current)return null;return current.model.groups.find(g=>g.id===current.groupId)||current.model.groups[0];}
function photos(){const g=chosen();return g?photosForGroup(g,current.scene):[];}
function move(delta){const list=photos();if(!current||list.length<2)return;current.index=(current.index+delta+list.length)%list.length;render();}
function render(){
  if(!current||!dialog)return;
  const {model}=current, group=chosen(), available=photos();
  if(!group||!available.length)return;
  current.index=Math.max(0,Math.min(current.index,available.length-1));
  const selected=available[current.index], token=++imageRequest;
  dialog.title.textContent=model.name;
  dialog.groups.replaceChildren(...model.groups.map(g=>{
    const btn=button(g.label,'dp-pill');btn.dataset.groupId=g.id;btn.setAttribute('aria-pressed',String(g.id===group.id));return btn;
  }));
  const scenes=['all',...new Set(group.photos.map(p=>p.scene))].filter(s=>s==='all'||group.photos.some(p=>p.scene===s));
  dialog.scenes.replaceChildren(...scenes.map(scene=>{
    const btn=button(SCENE_LABEL[scene]||'Ракурс','dp-scene');btn.dataset.sceneId=scene;btn.setAttribute('aria-pressed',String(current.scene===scene));return btn;
  }));
  const canMove=available.length>1;dialog.prev.hidden=!canMove;dialog.next.hidden=!canMove;
  dialog.caption.textContent=selected.caption;dialog.counter.textContent=`${current.index+1} / ${available.length}`;
  dialog.cta.href=model.url;dialog.cta.textContent=`Выбрать модель ${model.name}`;
  dialog.thumbs.replaceChildren(...available.map((item,i)=>{
    const btn=button('','dp-thumb',`${item.caption}: фото ${i+1}`);btn.dataset.photoIndex=String(i);btn.setAttribute('aria-pressed',String(i===current.index));
    const img=element('img');img.alt='';img.loading='lazy';img.decoding='async';img.src=item.src;
    const label=element('span');label.textContent=item.caption;btn.append(img,label);return btn;
  }));
  dialog.failed.hidden=true;
  dialog.photo.style.opacity='0';
  dialog.photo.classList.remove('dp-enter');
  // Never allow earlier asynchronous loads to replace the user's newer selection.
  const preloaded=new Image();preloaded.decoding='async';
  preloaded.onload=()=>{
    if(!current||token!==imageRequest)return;
    dialog.photo.src=selected.src;
    dialog.photo.alt=`${model.name}: ${selected.caption}`;
    dialog.photo.style.opacity='';
    void dialog.photo.offsetWidth;dialog.photo.classList.add('dp-enter');
  };
  preloaded.onerror=()=>{if(current&&token===imageRequest){dialog.photo.removeAttribute('src');dialog.photo.alt='';dialog.photo.style.opacity='';dialog.failed.hidden=false;}};
  preloaded.src=selected.src;
}
export async function openModelGallery(modelId,source=null,groupId=null){
  if(!safeModel(modelId))return false;
  let models;
  try{models=await loadCatalog();}catch(err){console.warn('Dacha Par gallery unavailable:',err);return false;}
  const model=models[modelId];if(!model||!Array.isArray(model.groups)||!model.groups.length)return false;
  if(!dialog)dialog=createDialog();
  current={model,groupId:model.groups.some(g=>g.id===groupId)?groupId:model.groups[0].id,scene:'all',index:0};
  focusReturn=source instanceof HTMLElement?source:document.activeElement;
  render();if(!dialog.d.open)dialog.d.showModal();dialog.d.querySelector('.dp-close').focus();return true;
}
export function installGalleryTriggers(){
  // Replacement is opt-in only: the original site's modal and events remain unchanged until integration QA passes.
  if(document.documentElement.dataset.dpGalleryV2!=='on')return false;
  document.addEventListener('click',e=>{
    const trigger=e.target.closest(SELECTOR);if(!trigger)return;
    const id=trigger.dataset.gallery;
    if(!['kvadro','viking','parus','kvadro-house'].includes(id))return;
    e.preventDefault();e.stopImmediatePropagation();void openModelGallery(id,trigger);
  },true);
  return true;
}
installGalleryTriggers();