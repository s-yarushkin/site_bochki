/**
 * V5 preview photography. The assets are local to this static site, not CDN.
 * V6.3: SUN and RAIN share the SAME Kvadro House master pixels for immutable
 * architecture. RAIN is graded by CSS; warm glass is a masked, decorative
 * blend of the existing approved dusk visual, not replacement building geometry.
 * No rain streaks are added to photos; landscaping remains disclosed.
 * Non-image product configuration data is unaffected.
 */
export const MEDIA_SLOTS=Object.freeze({
  'hero-sun-desktop':{file:'hero-sun.webp',alt:'Реальная баня Квадро Хаус днём. Газон и мостки художественно визуализированы'},
  'hero-rain-desktop':{file:'hero-sun.webp',alt:'Баня «Квадро Хаус»: вечерняя световая обработка дневного кадра, архитектура сохранена. Благоустройство участка визуализировано'},
  'catalog-kvadro':{file:'catalog-kvadro.webp',alt:'Модель «Квадро» на участке, реальное фото'},
  'catalog-parus':{file:'catalog-parus.webp',alt:'Модель «Парус» на участке, реальное фото'},
  'catalog-viking':{file:'catalog-viking.webp',alt:'Модель «Викинг» на участке, реальное фото'},
  'catalog-kvadro-house':{file:'hero-sun.webp',alt:'Реальная баня «Квадро Хаус» днём; благоустройство участка визуализировано'},
  'catalog-kvadro-house-rain':{file:'hero-sun.webp',alt:'Баня «Квадро Хаус» вечером, дневная фотография с обработкой освещения; благоустройство участка визуализировано'},
  'bundle-comfort':{file:'hero-sun.webp',alt:'Баня «Квадро Хаус» днём, пример модели; не фото конкретной комплектации'},
  'bundle-comfort-rain':{file:'hero-sun.webp',alt:'Пример бани «Квадро Хаус» с вечерним освещением; не фотография конкретной комплектации'},
  'cta-evening-cozy':{file:'mood-evening.webp',alt:'Готовая баня с подсветкой во дворе зимним вечером'},
  'product-steam':{file:'interior.webp',alt:'Пример отделки внутри готовой бани'},
  'product-interior':{file:'interior.webp',alt:'Пример интерьера бани семейства «Викинг»'},
  'site-example':{file:'site-example.webp',alt:'Готовая баня на загородном участке'},
  'side-kvadro-house':{file:'hero-sun.webp',alt:'Реальная баня «Квадро Хаус» днём, благоустройство участка на изображении визуализировано'},
  'side-kvadro-house-rain':{file:'hero-sun.webp',alt:'Баня «Квадро Хаус» с вечерней обработкой дневного кадра; благоустройство участка визуализировано'},
  'polok-backlight':{file:'interior.webp',alt:'Пример отделки и печи внутри готовой бани'},
  'stove-water-tank':{file:'site-example.webp',alt:'Установленная баня на участке'},
  'product-front':null
});
export const MEDIA_ASSET_ROOT='assets/media-v5/';
export function resolveMedia(slot){
  return Object.hasOwn(MEDIA_SLOTS,slot)?MEDIA_SLOTS[slot]:null;
}
export function syncMedia(root=document){
  for(const frame of root.querySelectorAll('[data-slot]')){
    const entry=resolveMedia(frame.dataset.slot);
    let img=frame.querySelector('img[data-v5-photo]');
    if(!entry){
      if(img)img.remove();
      frame.classList.remove('media-ready');
      frame.removeAttribute('data-image-status');
      continue;
    }
    if(img?.dataset.mediaFile===entry.file){
      // SUN and RAIN deliberately share one geometry source. Always update
      // the semantic slot and accessible alt; do not leave an in-flight
      // image load bound to the former slot when weather is switched rapidly.
      frame.dataset.mediaSlotLoadedFor=frame.dataset.slot;
      img.alt=entry.alt;
      if(img.complete&&img.naturalWidth>0){
        frame.classList.add('media-ready');
        frame.dataset.imageStatus='loaded';
      }
      continue;
    }
    if(img)img.remove();
    frame.classList.remove('media-ready');
    frame.dataset.imageStatus='loading';
    img=root.createElement?root.createElement('img'):document.createElement('img');
    img.dataset.v5Photo='';
    img.dataset.mediaFile=entry.file;
    img.className='v5-photo';
    img.alt=entry.alt;
    img.decoding='async';
    img.loading=frame.id==='heroMedia'?'eager':'lazy';
    if(frame.id==='heroMedia')img.fetchPriority='high';
    img.addEventListener('load',()=>{
      if(!img.isConnected||frame.dataset.slot!==frame.dataset.mediaSlotLoadedFor)return;
      frame.classList.add('media-ready');
      frame.dataset.imageStatus='loaded';
    });
    img.addEventListener('error',()=>{
      if(!img.isConnected)return;
      frame.dataset.imageStatus='missing';
      frame.classList.remove('media-ready');
    });
    // The same image is intentionally reused after switching themes if no pair.
    frame.dataset.mediaSlotLoadedFor=frame.dataset.slot;
    frame.append(img);
    img.src=new URL(MEDIA_ASSET_ROOT+entry.file,document.baseURI).href;
  }
}
