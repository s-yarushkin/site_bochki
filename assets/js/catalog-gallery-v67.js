/* V6.7 — one verified catalog image album per model. Photos remain grouped;
   changing theme, card filters, or the configurator never mixes albums. */
export const MODEL_ALBUMS=Object.freeze({
  kvadro:{name:'Квадро',photos:[
    ['kvadro-outside.webp','Снаружи'],['kvadro-steam.webp','Парная'],
    ['kvadro-lounge.webp','Комната отдыха'],['kvadro-entry.webp','Входная зона']
  ]},
  parus:{name:'Парус',photos:[
    ['parus-outside.webp','Снаружи'],['parus-steam.webp','Парная'],
    ['parus-lounge.webp','Комната отдыха'],['parus-stove.webp','Печь'],
    ['parus-shower.webp','Душевая зона']
  ]},
  viking:{name:'Викинг',photos:[
    ['viking-outside.webp','Снаружи'],['viking-steam.webp','Парная'],
    ['viking-lounge.webp','Комната отдыха'],['viking-stove.webp','Печь']
  ]},
  'kvadro-house':{name:'Квадро Хаус',photos:[
    ['kvadro-house-outside.webp','Снаружи'],['kvadro-house-steam.webp','Парная'],
    ['kvadro-house-lounge.webp','Комната отдыха'],['kvadro-house-stove.webp','Печь'],
    ['kvadro-house-veranda.webp','Веранда']
  ]}
});

export function initModelGallery(){
  const dialog=document.createElement('dialog');
  dialog.id='modelGallery';
  dialog.className='model-gallery';
  dialog.setAttribute('aria-label','Фотографии выбранной модели бани');
  dialog.innerHTML=`<div class="model-gallery-shell">
    <header class="model-gallery-header">
      <div><small>ФОТОГРАФИИ МОДЕЛИ</small><h2 id="modelGalleryTitle"></h2></div>
      <button class="model-gallery-close" type="button" data-gallery-close aria-label="Закрыть фотографии">×</button>
    </header>
    <div class="model-gallery-layout">
      <figure class="model-gallery-stage">
        <img id="modelGalleryImage" alt="" decoding="async"/>
        <button type="button" class="model-gallery-arrow previous" data-gallery-prev aria-label="Предыдущая фотография">‹</button>
        <button type="button" class="model-gallery-arrow next" data-gallery-next aria-label="Следующая фотография">›</button>
        <figcaption><strong id="modelGalleryCaption"></strong><span id="modelGalleryCounter"></span></figcaption>
      </figure>
      <div id="modelGalleryThumbs" class="model-gallery-thumbs" aria-label="Все фотографии выбранной модели"></div>
    </div>
    <p class="model-gallery-hint">Нажмите на миниатюру или используйте стрелки клавиатуры. Esc — закрыть.</p>
  </div>`;
  document.body.append(dialog);
  let activeModel=null,index=0,returnFocus=null;
  const image=dialog.querySelector('#modelGalleryImage');
  const title=dialog.querySelector('#modelGalleryTitle');
  const caption=dialog.querySelector('#modelGalleryCaption');
  const counter=dialog.querySelector('#modelGalleryCounter');
  const thumbs=dialog.querySelector('#modelGalleryThumbs');
  const src=file=>new URL('assets/catalog-v66/'+file,document.baseURI).href;
  function draw(){
    const album=MODEL_ALBUMS[activeModel];
    if(!album)return;
    const [file,scene]=album.photos[index];
    title.textContent=album.name;
    image.src=src(file);
    image.alt=album.name+' — '+scene.toLowerCase();
    caption.textContent=scene;
    counter.textContent=(index+1)+' / '+album.photos.length;
    thumbs.innerHTML=album.photos.map(([f,label],i)=>`<button type="button" class="model-gallery-thumb ${i===index?'is-current':''}" data-gallery-thumb="${i}" aria-pressed="${i===index}" aria-label="${label} — фото ${i+1}">
      <img src="${src(f)}" alt="" loading="lazy" decoding="async"/><span>${label}</span>
    </button>`).join('');
  }
  function show(modelId,first=0,origin=null){
    if(!Object.hasOwn(MODEL_ALBUMS,modelId))return;
    activeModel=modelId;
    index=Math.max(0,Math.min(Number(first)||0,MODEL_ALBUMS[modelId].photos.length-1));
    returnFocus=origin instanceof HTMLElement?origin:document.activeElement;
    draw();
    if(!dialog.open)dialog.showModal();
    dialog.querySelector('[data-gallery-close]').focus();
  }
  function move(delta){
    if(!activeModel)return;
    const len=MODEL_ALBUMS[activeModel].photos.length;
    index=(index+delta+len)%len;
    draw();
  }
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-gallery-open]');
    if(trigger){event.preventDefault();show(trigger.dataset.galleryOpen,trigger.dataset.galleryFirst,trigger);return;}
    if(event.target===dialog&&dialog.open)dialog.close();
  });
  dialog.addEventListener('click',event=>{
    if(event.target.closest('[data-gallery-close]'))dialog.close();
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
  });
}
