import {HERO_MODELS,validHeroModel,heroOffer} from './catalog.mjs';
import {analytics} from '/analytics-core.mjs';
import {roofPoints} from './roof-points.mjs';
const hero=document.querySelector('[data-home-hero]');
let image=document.querySelector('#hh-world');
const buttons=[...document.querySelectorAll('[data-hh-model]')];
const status=document.querySelector('#hh-status');
const plans=document.querySelector('#hh-plans');
const request=document.querySelector('.hh-header-request');
const depthImage=document.querySelector('#hh-depth-image');
const depthViewport=matchMedia('(min-width:1101px)');
const initial=validHeroModel(new URL(location.href).searchParams.get('model'));
let model='kvadro',sequence=0,book=null;
const money=price=>'от '+new Intl.NumberFormat('ru-RU').format(price)+' ₽';
const sources=id=>({src:`/home-hero/assets/${HERO_MODELS[id].asset}-1920.webp`,srcset:[640,1280,1920].map(width=>`/home-hero/assets/${HERO_MODELS[id].asset}-${width}.webp ${width}w`).join(', ')});
function syncDepth(){
  if(depthViewport.matches)depthImage.setAttribute('href',image.currentSrc||image.src);
  else depthImage.removeAttribute('href');
}
depthViewport.addEventListener('change',syncDepth);
image.addEventListener('load',syncDepth);
function render(){
  const data=HERO_MODELS[model];
  document.querySelector('#hh-roof-points').setAttribute('points',roofPoints[model]);
  syncDepth();
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.hhModel===model));
  document.querySelector('#hh-model-name').textContent=data.name;
  document.querySelector('#hh-model-spec').textContent=data.spec;
  document.querySelector('#hh-model-detail').href='/bani/'+data.slug+'/';
  plans.href='/planirovki/?model='+model;
  plans.setAttribute('aria-label','Выбрать планировку бани '+data.name);
  request.dataset.model=model;request.dataset.size=book?heroOffer(book,model).size:model==='kvadro-house'?'4x4':'400';
  for(const card of document.querySelectorAll('#models [data-model-card]'))card.dataset.hhSelected=String(card.dataset.modelCard===model);
}
async function select(next,{user=false}={}){
  const ticket=++sequence;
  if(next===model){hero.classList.remove('hh-loading');hero.removeAttribute('aria-busy');return;}
  const urls=sources(next),preload=new Image();preload.src=urls.src;
  hero.classList.add('hh-loading');hero.setAttribute('aria-busy','true');status.textContent='';
  try{
    await preload.decode();if(ticket!==sequence)return;
    // Insert the already decoded image itself: assigning srcset to the old element
    // could select another responsive resource and briefly expose a blank frame.
    preload.id=image.id;preload.className=image.className;preload.width=1920;preload.height=1080;
    preload.alt=HERO_MODELS[next].name+' в вечернем саду: тёплые окна и дорожка к своей бане';
    image.replaceWith(preload);image=preload;
    model=next;render();
    if(user){
      const url=new URL(location.href);url.searchParams.set('model',model);history.replaceState(history.state,'',url);
      analytics?.track('dp_model_select',{model,placement:'hero',experiment_id:'home_world',variant:'garden'});
    }
  }catch{if(ticket===sequence)status.textContent='Не удалось сменить кадр. Попробуйте ещё раз или выберите модель в каталоге ниже.';}
  finally{if(ticket===sequence){hero.classList.remove('hh-loading');hero.removeAttribute('aria-busy');}}
}
for(const button of buttons)button.addEventListener('click',()=>select(button.dataset.hhModel,{user:true}));
plans.addEventListener('click',()=>analytics?.track('dp_cta_click',{model,placement:'hero',experiment_id:'home_world',variant:'garden'}));
fetch('/data/catalog-pricebook.json',{signal:AbortSignal.timeout(10000)}).then(async response=>{
  if(!response.ok)throw Error('PRICEBOOK');book=await response.json();
  for(const element of document.querySelectorAll('[data-hh-price]'))element.textContent=money(heroOffer(book,element.dataset.hhPrice).price);
  render();
}).catch(()=>{status.textContent='Актуальную стоимость уточните в каталоге ниже.';});
render();if(initial!==model)select(initial);
