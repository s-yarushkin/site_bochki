import {HERO_MODELS} from './catalog.mjs';

const model=new URL(location.href).searchParams.get('model');
if(Object.hasOwn(HERO_MODELS,model)){
  const home='/?model='+encodeURIComponent(model);
  document.querySelector('[data-return-catalog]').href=home+'#models';
  document.querySelector('[data-return-hero]').href=home+'#main';
}
