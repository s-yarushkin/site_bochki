/**
 * V5 preview photography. The assets are local to this static site, not CDN.
 * Only the hero has an owner-approved landscaping SUN/RAIN artistic pair; the real bathhouse is unchanged.
 * All other models deliberately use the SAME REAL image in both themes.
 * Non-image product configuration data is unaffected.
 */
export const MEDIA_SLOTS=Object.freeze({
  'hero-sun-desktop':{file:'hero-sun.webp',alt:'Реальная баня Квадро Хаус днём. Газон и мостки художественно визуализированы'},
  'hero-rain-desktop':{file:'hero-rain.webp',alt:'Та же реальная баня в дождь — художественная обработка фото и визуализация благоустройства участка'},
  'catalog-kvadro':{file:'catalog-kvadro.webp',alt:'Модель «Квадро» на участке, реальное фото'},
  'catalog-parus':{file:'catalog-parus.webp',alt:'Модель «Парус» на участке, реальное фото'},
  'catalog-viking':{file:'catalog-viking.webp',alt:'Модель «Викинг» на участке, реальное фото'},
  'catalog-kvadro-house':{file:'catalog-kvadro-house.webp',alt:'Модель «Квадро Хаус» на участке, реальное фото'},
  'bundle-comfort':{file:'catalog-kvadro-house.webp',alt:'Баня семейства «Квадро Хаус», пример объекта, не фото конкретной комплектации'},
  'cta-evening-cozy':{file:'mood-evening.webp',alt:'Готовая баня с подсветкой во дворе зимним вечером'},
  'product-steam':{file:'interior.webp',alt:'Пример отделки внутри готовой бани'},
  'product-interior':{file:'interior.webp',alt:'Пример интерьера бани семейства «Викинг»'},
  'site-example':{file:'site-example.webp',alt:'Готовая баня на загородном участке'},
  'side-kvadro-house':{file:'side-kvadro-house.webp',alt:'Вид сбоку на готовую баню семейства «Квадро Хаус»'},
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
    if(img?.dataset.mediaFile===entry.file)continue;
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
