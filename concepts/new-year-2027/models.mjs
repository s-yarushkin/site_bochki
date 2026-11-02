import {MODELS,modelSelection,modelOffer,priceText} from './catalog.mjs';
const buttons=[...document.querySelectorAll('[data-model]')];
const sizes=document.querySelector('#size-options');
const hero=document.querySelector('.hero'),image=document.querySelector('.hero-world');
const loading=document.querySelector('#scene-loading'),status=document.querySelector('#catalog-status');
let book=null,selection=null,model='kvadro',size='400',imageRequest=0;
const remembered=new Map();
const assets=id=>({src:`assets/${MODELS[id].image}-1536.webp`,srcset:[640,960,1536].map(width=>`assets/${MODELS[id].image}-${width}.webp ${width}w`).join(', ')});
export function currentOffer(){return book&&selection?{book,...modelOffer(book,selection)}:null;}

function render(){
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.model===model));
  document.querySelector('#model-name').textContent=MODELS[model].name;
  document.querySelector('#model-description').textContent=MODELS[model].description;
  document.querySelector('#model-dimensions').textContent=MODELS[model].dimensions;
  document.querySelector('#size-label').textContent=model==='kvadro-house'?'Размер бани':'Длина бани';
  document.body.dataset.model=model;
  if(!book)return;
  const offer=modelOffer(book,{model,size});selection=offer.selection;size=selection.size;remembered.set(model,size);
  sizes.replaceChildren(...Object.entries(book.r85.models[model].sizes).map(([id,item])=>{
    const button=document.createElement('button');button.type='button';button.dataset.size=id;
    button.textContent=item.label;button.setAttribute('aria-pressed',String(id===size));return button;
  }));
  document.querySelector('#model-price').textContent=priceText(offer.price);
  document.dispatchEvent(new CustomEvent('dachapar:campaign-selection',{detail:{model,size}}));
}
async function changeScene(id){
  const request=++imageRequest,source=assets(id),preload=new Image();
  status.textContent='';
  loading.hidden=false;hero.classList.add('scene-changing');hero.setAttribute('aria-busy','true');
  // A fixed preload URL keeps decode() stable if the viewport changes mid-load.
  preload.src=source.src;
  try{
    await preload.decode();if(request!==imageRequest)return;
    image.sizes='100vw';image.srcset=source.srcset;image.src=source.src;
    image.alt=`Новогодняя визуализация ${MODELS[id].name}: баня в снегу, гирлянды и тёплый свет`;
    model=id;size=remembered.get(model)||(model==='kvadro-house'?'4x4':size);
    render();
  }catch{
    if(request===imageRequest)status.textContent='Не удалось загрузить зимний кадр. Попробуйте выбрать модель ещё раз.';
    return;
  }finally{if(request===imageRequest){loading.hidden=true;hero.classList.remove('scene-changing');hero.removeAttribute('aria-busy');}}
}
for(const button of buttons)button.addEventListener('click',async()=>{
  const next=button.dataset.model;
  if(next===model){imageRequest++;loading.hidden=true;hero.classList.remove('scene-changing');hero.removeAttribute('aria-busy');return;}
  // Commit picture, selected button and offer together after successful decoding.
  await changeScene(next);
});
sizes.addEventListener('click',event=>{
  const button=event.target.closest('[data-size]');if(!button||!book)return;
  size=button.dataset.size;render();
});
export const catalogReady=fetch('/data/catalog-pricebook.json',{signal:AbortSignal.timeout(10000)})
  .then(async response=>{if(!response.ok)throw Error('CATALOG');book=await response.json();render();status.textContent='';return true;})
  .catch(()=>{document.querySelector('#model-price').textContent='Стоимость уточним';status.textContent='Не удалось загрузить прайс. Позвоните: +7 (951) 734-99-99.';sizes.querySelectorAll('button').forEach(b=>b.disabled=true);return false;});
