// Isolated built-object gallery. No pricing, form, API or authentication writes.
const catalogURL = new URL('./catalog.json', import.meta.url);
const assetURL = new URL('./assets/photos/', import.meta.url);
const labels = {outside:'Снаружи',steam:'Парная',lounge:'Комната отдыха'};
let catalogPromise, dialog, current, index = 0, origin, photoRequest = 0;
const url = (photo, size = 'full') => new URL(`${photo.id}-${size}.webp`, assetURL).href;
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
};
function button(text, cls, aria) {
  const node = el('button', cls, text); node.type = 'button';
  if (aria) node.setAttribute('aria-label', aria);
  return node;
}
function loadCatalog() {
  if (!catalogPromise) catalogPromise = fetch(catalogURL, {credentials:'same-origin'})
    .then(r => { if (!r.ok) throw Error('Viking catalog unavailable'); return r.json(); })
    .then(data => {
      if (data.schemaVersion !== 1 || data.model !== 'viking' || !Array.isArray(data.objects) || !data.objects.length) throw Error('Invalid Viking catalog');
      for (const o of data.objects) {
        if (!/^[a-z-]+$/.test(o.id) || !o.photos?.length || !o.photos.every(p => /^[a-z-]+$/.test(p.id) && labels[p.scene])) throw Error('Invalid Viking object');
      }
      return data;
    }).catch(error => { catalogPromise = undefined; throw error; });
  return catalogPromise;
}
function createDialog(objects) {
  const d = el('dialog', 'vk-dialog'); d.id = 'vk-built-gallery'; d.setAttribute('aria-labelledby', 'vk-gallery-title');
  const shell = el('div', 'vk-dialog-shell');
  const close = button('×','vk-close','Закрыть фотографии'); close.addEventListener('click', () => d.close());
  const tabs = el('div','vk-tabs'); tabs.setAttribute('role','group'); tabs.setAttribute('aria-label','Построенные Викинги');
  for (const object of objects) {
    const b = button('','vk-tab'); b.dataset.vkSelect = object.id;
    const thumb = el('img'); thumb.src = url(object.photos[0], '480'); thumb.alt = ''; thumb.width = 45; thumb.height = 51;
    b.append(thumb,el('span','',object.title)); tabs.append(b);
  }
  const stage = el('div','vk-stage');
  const prev = button('‹','vk-arrow','Предыдущее фото'); prev.dataset.vkStep = '-1';
  const next = button('›','vk-arrow','Следующее фото'); next.dataset.vkStep = '1';
  const im = el('img','vk-main-image'); im.id = 'vk-gallery-image'; im.alt = ''; im.decoding = 'async';
  stage.append(prev,im,next);
  const status = el('p','vk-status'); status.setAttribute('role','status'); status.hidden = true;
  const thumbs = el('div','vk-thumbs'); thumbs.setAttribute('role','group'); thumbs.setAttribute('aria-label','Фотографии выбранной бани');
  const caption = el('div','vk-caption');
  const counter = el('p','vk-counter'); counter.id='vk-counter'; counter.setAttribute('aria-live','polite');
  const title = el('h2'); title.id='vk-gallery-title';
  const description = el('p'); description.id='vk-description';
  const note = el('p','vk-note'); note.id='vk-note';
  const cta = el('a','vk-button','Обсудить свой Викинг'); cta.href='/?model=viking&request=custom#configure';
  caption.append(counter,title,description,note,cta);
  shell.append(close,el('p','vk-eyebrow','Викинг · Примеры выполненных работ'),tabs,stage,status,thumbs,caption); d.append(shell); document.body.append(d);
  d.addEventListener('click', event => {
    const b = event.target.closest('button');
    if (b?.dataset.vkSelect) { current = objects.find(o=>o.id===b.dataset.vkSelect); index=0; draw(); }
    else if (b?.dataset.vkPhoto !== undefined) { index=Number(b.dataset.vkPhoto); draw(); }
    else if (b?.dataset.vkStep) move(Number(b.dataset.vkStep));
    else if (event.target === d) {const r=d.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)d.close();}
  });
  d.addEventListener('keydown', event => {
    if (event.key==='ArrowLeft'||event.key==='ArrowRight') {event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
  });
  let touch;
  stage.addEventListener('touchstart', e=>{touch=e.touches[0]?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
  stage.addEventListener('touchend',e=>{const end=e.changedTouches[0];if(touch&&end){const dx=end.clientX-touch.x,dy=end.clientY-touch.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy))move(dx<0?1:-1);}touch=null;},{passive:true});
  d.addEventListener('close',()=>{photoRequest++;if(origin?.isConnected)origin.focus({preventScroll:true});});
  return d;
}
function move(delta) { if(current){ index=(index+delta+current.photos.length)%current.photos.length;draw(); } }
function draw() {
  const p=current.photos[index], im=dialog.querySelector('.vk-main-image'), token=++photoRequest;
  im.alt=p.alt; im.dataset.photoId=p.id;
  const status=dialog.querySelector('.vk-status'); status.hidden=true;
  im.onload=()=>{if(token===photoRequest)status.hidden=true;};
  im.onerror=()=>{if(token!==photoRequest)return;if(im.dataset.fallback!=='yes'){im.dataset.fallback='yes';im.src=url(p,'960');}else{status.hidden=false;status.textContent='Фотография временно недоступна. Выберите другой ракурс.';}};
  im.dataset.fallback='no'; im.src=url(p);
  dialog.querySelector('#vk-gallery-title').textContent=current.title;
  dialog.querySelector('#vk-description').textContent=p.caption;
  dialog.querySelector('#vk-counter').textContent=`${labels[p.scene]} · ${index+1} / ${current.photos.length}`;
  dialog.querySelector('#vk-note').textContent=current.note;
  for(const b of dialog.querySelectorAll('[data-vk-select]'))b.setAttribute('aria-pressed',String(b.dataset.vkSelect===current.id));
  dialog.querySelector('.vk-thumbs').replaceChildren(...current.photos.map((photo,i)=>{
    const b=button('','',photo.caption);b.dataset.vkPhoto=String(i);b.setAttribute('aria-pressed',String(i===index));
    const img=el('img');img.src=url(photo,'480');img.alt='';img.width=64;img.height=64;b.append(img);return b;
  }));
}
async function openPhoto(id, from) {
  const catalog=await loadCatalog(), object=catalog.objects.find(o=>o.id===id);
  if(!object)return;
  if(!dialog)dialog=createDialog(catalog.objects);
  current=object;index=0;origin=from||document.activeElement;draw();if(!dialog.open)dialog.showModal();
}
document.addEventListener('click',e=>{
  const trigger=e.target.closest('[data-vk-object]');
  if(!trigger)return;
  e.preventDefault();
  openPhoto(trigger.dataset.vkObject,trigger).catch(()=>{
    const message=document.querySelector('#vk-gallery-error');
    if(message){message.hidden=false;message.textContent='Галерея временно недоступна. Фотографии можно открыть по ссылкам ниже.';}
  });
});
if(location.pathname==='/bani/viking/'){
  const requested=new URLSearchParams(location.search).get('work');
  if(['cream','brown','deck'].includes(requested)){
    const trigger=document.querySelector(`[data-vk-object="${requested}"]`);
    if(trigger){document.querySelector('#photos')?.scrollIntoView({block:'start'});openPhoto(requested,trigger).catch(()=>{});}
  }
}
export {openPhoto};
