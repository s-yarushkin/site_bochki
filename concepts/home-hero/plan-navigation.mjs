import {HERO_MODELS} from './catalog.mjs';

const previous = new URL(location.href);
const model = previous.searchParams.get('model');
const target = new URL('/',location.origin);
for(const [key,value] of previous.searchParams){
  if(key.startsWith('utm_') || key === 'yclid') target.searchParams.append(key,value);
}
target.hash = 'models';
if(Object.hasOwn(HERO_MODELS,model)){
  target.searchParams.set('bath',model);
  target.hash = 'bath-model';
}
location.replace(target);
