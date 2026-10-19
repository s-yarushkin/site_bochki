/* Model-specific photo albums. Real object photos remain source-scoped. */
import {realModelPhotos} from './real-object-gallery-v69.js';
export const V68_MEDIA_PATHS=Object.freeze({
  'kvadro-outside.webp':'assets/catalog-v68-ai/kvadro-outside-v68.webp',
  'kvadro-steam.webp':'assets/catalog-v68-ai/kvadro-steam-v68.webp',
  'kvadro-lounge.webp':'assets/catalog-v68-ai/kvadro-lounge-v68.webp',
  'parus-outside.webp':'assets/catalog-v68-ai/parus-outside-v68.webp',
  'parus-lounge.webp':'assets/catalog-v68-ai/parus-lounge-v68.webp',
  'viking-outside.webp':'assets/catalog-v68-ai/viking-outside-v68.webp',
  // Owner's 19.10 scope: replace this cover only with the existing SUN master.
  'kvadro-house-outside.webp':'assets/media-v5/hero-sun.webp'
});
// Only seven individually reviewed concept visualizations. The eleven small or
// contaminated brochure fragments remain archived but are hidden from preview.
export const MODEL_ALBUMS=Object.freeze({
  kvadro:{name:'Квадро',photos:[
    ['kvadro-outside.webp','Снаружи'],['kvadro-steam.webp','Парная'],
    ['kvadro-lounge.webp','Комната отдыха']
  ]},
  parus:{name:'Парус',photos:[
    ['parus-outside.webp','Снаружи'],
    ...realModelPhotos('parus').map(photo=>[photo.path,photo.label]),
    ['parus-lounge.webp','Комната отдыха']
  ]},
  viking:{name:'Викинг',photos:[['viking-outside.webp','Снаружи'],...realModelPhotos('viking').map(photo=>[photo.path,photo.label])]},
  'kvadro-house':{name:'Квадро Хаус',photos:[
    ['kvadro-house-outside.webp','Снаружи'],
    ...realModelPhotos('kvadro-house').map(photo=>[photo.path,photo.label])
  ]}
});


// A scene is a photo group within one model; no cross-model mixing.
export function sceneForLabel(label){return label==='Снаружи'?'outside':'inside';}
export function getModelScenePhotos(modelId,scene='all'){
  const album=MODEL_ALBUMS[modelId];
  if(!album)return [];
  return album.photos.map(([file,label],index)=>({file,label,index,scene:sceneForLabel(label)}))
    .filter(photo=>scene==='all'||photo.scene===scene);
}

export function initModelGallery(){
  const dialog=document.createElement('dialog');
  dialog.id='modelGallery';
  dialog.className='model-gallery';
  dialog.setAttribute('aria-label','Изображения выбранной модели бани');
  dialog.innerHTML=`<div class="model-gallery-shell">
    <header class="model-gallery-header">
      <div><small>ИЗОБРАЖЕНИЯ МОДЕЛИ</small><h2 id="modelGalleryTitle"></h2></div>
      <button class="model-gallery-close" type="button" data-gallery-close aria-label="Закрыть фотографии">×</button>
    </header>
    <div class="model-gallery-scenes" id="modelGalleryScenes" role="group" aria-label="Категория фотографий"></div>
    <div class="model-gallery-layout">
      <figure class="model-gallery-stage">
        <img id="modelGalleryImage" alt="" decoding="async"/>
        <button type="button" class="model-gallery-arrow previous" data-gallery-prev aria-label="Предыдущая фотография">‹</button>
        <button type="button" class="model-gallery-arrow next" data-gallery-next aria-label="Следующая фотография">›</button>
        <figcaption><strong id="modelGalleryCaption"></strong><span id="modelGalleryCounter"></span></figcaption>
      </figure>
      <div id="modelGalleryThumbs" class="model-gallery-thumbs" aria-label="Все фотографии выбранной модели"></div>
    </div>
    <p class="model-gallery-hint">Листайте изображения стрелками или выбирайте миниатюры. Esc — закрыть.</p>
  </div>`;
  document.body.append(dialog);
  let activeModel=null,index=0,activeScene='all',returnFocus=null;
  const image=dialog.querySelector('#modelGalleryImage');
  const title=dialog.querySelector('#modelGalleryTitle');
  const caption=dialog.querySelector('#modelGalleryCaption');
  const counter=dialog.querySelector('#modelGalleryCounter');
  const thumbs=dialog.querySelector('#modelGalleryThumbs');
  const scenes=dialog.querySelector('#modelGalleryScenes');
  const src=file=>new URL(V68_MEDIA_PATHS[file]??(file.startsWith('assets/real-objects/')?file:'assets/catalog-v66/'+file),document.baseURI).href;
  const visiblePhotos=()=>getModelScenePhotos(activeModel,activeScene);
  function chooseScene(scene){
    if(!['all','outside','inside'].includes(scene))return;
    activeScene=scene;index=0;draw();
  }
  function draw(){
    const album=MODEL_ALBUMS[activeModel],photos=visiblePhotos();
    if(!album||!photos.length)return;
    index=Math.min(Math.max(0,index),photos.length-1);
    const photo=photos[index];
    title.textContent=album.name;
    image.src=src(photo.file);
    image.alt=album.name+' — '+photo.label.toLowerCase();
    caption.textContent=photo.label;
    counter.textContent=(index+1)+' / '+photos.length;
    const canNavigate=photos.length>1;
    dialog.querySelector('[data-gallery-prev]').hidden=!canNavigate;
    dialog.querySelector('[data-gallery-next]').hidden=!canNavigate;
    const categories=[
      {id:'all',label:'Все'},
      {id:'outside',label:'Снаружи'},
      {id:'inside',label:'Внутри'}
    ].filter(category=>category.id==='all'||getModelScenePhotos(activeModel,category.id).length>0);
    scenes.innerHTML=categories.map(category=>
      `<button type="button" class="model-gallery-scene ${category.id===activeScene?'active':''}" data-gallery-scene-select="${category.id}" aria-pressed="${category.id===activeScene}">${category.label}</button>`
    ).join('');
    thumbs.innerHTML=photos.map((item,i)=>
      `<button type="button" class="model-gallery-thumb ${i===index?'is-current':''}" data-gallery-thumb="${i}" aria-pressed="${i===index}" aria-label="${item.label} — фото ${i+1}">
        <img src="${src(item.file)}" alt="" loading="lazy" decoding="async"/><span>${item.label}</span>
      </button>`
    ).join('');
  }
  function show(modelId,first=0,origin=null,scene='all'){
    if(!Object.hasOwn(MODEL_ALBUMS,modelId))return;
    activeModel=modelId;
    activeScene=['all','outside','inside'].includes(scene)?scene:'all';
    const visible=visiblePhotos();
    const requested=Math.max(0,Number(first)||0);
    index=Math.max(0,visible.findIndex(photo=>photo.index===requested));
    returnFocus=origin instanceof HTMLElement?origin:document.activeElement;
    draw();
    if(!dialog.open)dialog.showModal();
    dialog.querySelector('[data-gallery-close]').focus();
  }
  function move(delta){
    if(!activeModel)return;
    const len=visiblePhotos().length;
    if(!len)return;
    index=(index+delta+len)%len;
    draw();
  }
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-gallery-open]');
    if(trigger){event.preventDefault();show(trigger.dataset.galleryOpen,trigger.dataset.galleryFirst,trigger,trigger.dataset.galleryScene||'all');return;}
    if(event.target===dialog&&dialog.open)dialog.close();
  });
  dialog.addEventListener('click',event=>{
    if(event.target.closest('[data-gallery-close]'))dialog.close();
    else if(event.target.closest('[data-gallery-scene-select]'))chooseScene(event.target.closest('[data-gallery-scene-select]').dataset.gallerySceneSelect);
    else if(event.target.closest('[data-gallery-prev]'))move(-1);
    else if(event.target.closest('[data-gallery-next]'))move(1);
    else {
      const thumb=event.target.closest('[data-gallery-thumb]');
      if(thumb){index=Number(thumb.dataset.galleryThumb);draw();dialog.querySelector('[data-gallery-thumb="'+index+'"]')?.focus();}
    }
  });
  dialog.addEventListener('keydown',event=>{
    if(event.key==='ArrowRight'){event.preventDefault();move(1);}
    if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
  });
  dialog.addEventListener('close',()=>{
    if(returnFocus?.isConnected)returnFocus.focus();
    activeModel=null;
    activeScene='all';
  });
}
