import {analytics} from '/analytics-core.mjs';
import {mountModelJourney} from './model-journey.mjs';

const image = document.querySelector('#hh-world');
const depthImage = document.querySelector('#hh-depth-image');
const depthViewport = matchMedia('(min-width:1101px)');
function syncDepth(){
  if(depthViewport.matches) depthImage.setAttribute('href',image.currentSrc || image.src);
  else depthImage.removeAttribute('href');
}
depthViewport.addEventListener('change',syncDepth);
image.addEventListener('load',syncDepth);
syncDepth();

const pricebook = fetch('/data/catalog-pricebook.json',{signal:AbortSignal.timeout(10000)}).then(response=>{
  if(!response.ok) throw Error('PRICEBOOK');
  return response.json();
});
mountModelJourney(pricebook);
document.querySelector('#hh-plans').addEventListener('click',()=>
  analytics?.track('dp_cta_click',{placement:'hero',experiment_id:'home_world',variant:'garden'}));
