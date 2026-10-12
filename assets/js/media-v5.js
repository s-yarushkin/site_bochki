/**
 * V6.6 media registry.
 * Keep the approved SUN/RAIN hero master untouched.
 * All catalog images below hero are crops of owner-provided Garant-Grupp brochure.
 * The PDF images are promotional renders/composites; they are NOT verified
 * documentary photos of delivered installations.
 */
const catalog=(file,alt)=>({file,path:'assets/catalog-v66/'+file,alt});
export const MEDIA_SLOTS=Object.freeze({
  'hero-sun-desktop':{file:'hero-sun.webp',alt:'Баня Квадро Хаус: утверждённая художественная обработка участка'},
  'hero-rain-desktop':{file:'hero-sun.webp',alt:'Баня Квадро Хаус: та же архитектура в дождевой теме'},
  'catalog-kvadro':catalog('kvadro-outside.webp','Квадро: наружный вид по каталогу производителя'),
  'catalog-parus':catalog('parus-outside.webp','Парус: наружный вид по каталогу производителя'),
  'catalog-viking':catalog('viking-outside.webp','Викинг: наружный вид по каталогу производителя'),
  'catalog-kvadro-house':catalog('kvadro-house-outside.webp','Квадро Хаус: наружный вид по каталогу производителя'),
  'catalog-kvadro-house-rain':catalog('kvadro-house-outside.webp','Квадро Хаус: каталоговая визуализация'),
  'bundle-comfort':catalog('kvadro-outside.webp','Квадро: пример внешнего вида комплектации Комфорт, детали могут отличаться'),
  'bundle-comfort-rain':catalog('kvadro-outside.webp','Квадро Комфорт: изображение из каталога'),
  'cta-evening-cozy':catalog('viking-outside.webp','Викинг: каталоговый внешний вид'),
  'product-steam':catalog('kvadro-steam.webp','Квадро: парная в каталоге'),
  'product-interior':catalog('parus-lounge.webp','Парус: интерьер в каталоге'),
  'site-example':catalog('parus-outside.webp','Парус: каталоговый внешний вид'),
  'side-kvadro-house':catalog('kvadro-house-outside.webp','Квадро Хаус: каталоговая визуализация'),
  'side-kvadro-house-rain':catalog('kvadro-house-outside.webp','Квадро Хаус: каталоговая визуализация'),
  'interior-kvadro':catalog('kvadro-lounge.webp','Квадро: комната отдыха по каталогу'),
  'interior-parus':catalog('parus-lounge.webp','Парус: зона отдыха по каталогу'),
  'interior-viking':catalog('viking-lounge.webp','Викинг: зона отдыха по каталогу'),
  'interior-kvadro-house':catalog('kvadro-house-lounge.webp','Квадро Хаус: комната отдыха по каталогу'),
  'detail-kvadro-steam':catalog('kvadro-steam.webp','Квадро: парная из каталога'),
  'detail-kvadro-lounge':catalog('kvadro-lounge.webp','Квадро: комната отдыха из каталога'),
  'detail-kvadro-entry':catalog('kvadro-entry.webp','Квадро: входная зона из каталога'),
  'detail-parus-steam':catalog('parus-steam.webp','Парус: парная из каталога'),
  'detail-viking-steam':catalog('viking-steam.webp','Викинг: парная из каталога'),
  'detail-kvadro-house-steam':catalog('kvadro-house-steam.webp','Квадро Хаус: парная из каталога'),
  'polok-backlight':catalog('kvadro-steam.webp','Квадро: парная по каталогу'),
  'stove-water-tank':catalog('viking-stove.webp','Викинг: печь по каталогу'),
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
    img.src=new URL(entry.path??(MEDIA_ASSET_ROOT+entry.file),document.baseURI).href;
  }
}
