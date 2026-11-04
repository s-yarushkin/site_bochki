import {HERO_MODELS} from '../home-hero/catalog.mjs';

export function normalizeChoice(book,plans,requested={}){
  const alias=requested.model==='kvadro-haus'?'kvadro-house':requested.model;
  const model=Object.hasOwn(HERO_MODELS,alias||'')?alias:'kvadro';
  const sizes=book.r85.models[model].sizes;
  const size=Object.hasOwn(sizes,requested.size||'')?requested.size:Object.keys(sizes)[0];
  const available=plans.filter(p=>p.models.includes(model)&&p.size===size);
  const layout=available.some(p=>p.id===requested.layout)?requested.layout:available[0]?.id??null;
  return {model,size,package:requested.package==='deluxe'?'deluxe':'comfort',layout};
}

export function choiceFromUrl(book,plans,href){
  const q=new URL(href).searchParams;
  return normalizeChoice(book,plans,{model:q.get('bath')||q.get('model'),size:q.get('bathSize'),package:q.get('package'),layout:q.get('layout')});
}

export function choiceUrl(href,state){
  const url=new URL(href);
  url.searchParams.set('bath',state.model);url.searchParams.set('bathSize',state.size);
  url.searchParams.set('package',state.package);
  if(state.layout)url.searchParams.set('layout',state.layout);else url.searchParams.delete('layout');
  return url;
}

export function choicePrice(book,state){
  const row=book.r85.models[state.model].sizes[state.size];
  return state.package==='deluxe'?row.deluxe.priceRub:row.priceRub;
}

// Customer labels use width × length; historical price keys stay unchanged.
export function choiceSizeLabel(book,model,size){
  const house={'4x4':'4×4 м','5x4':'4×5 м','6x4':'4×6 м','6x5':'5×6 м','6x6':'6×6 м'};
  return model==='kvadro-house'?house[size]:book.r85.models[model].sizes[size].label;
}
