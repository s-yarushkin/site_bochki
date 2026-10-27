import {analytics} from './analytics-runtime.mjs?v=r100-20261027';
import {CHOICE_KEY,REFERENCE_KEY,readJSON,variantURL,cleanReference} from './journey-state.mjs?v=r100-20261027';
fetch('/data/site-settings.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(s=>analytics.start(s)).catch(()=>{});
function refresh(){
 const saved=readJSON(localStorage,CHOICE_KEY),reference=cleanReference(readJSON(localStorage,REFERENCE_KEY));
 for(const a of document.querySelectorAll('[data-my-variant]')){a.href=saved?variantURL(location.origin,saved,reference):'/#configure';a.textContent=saved?'Мой вариант':'Рассчитать баню';}
}
refresh();addEventListener('storage',refresh);document.addEventListener('dp:r85-render',refresh);
document.addEventListener('click',e=>{
 const a=e.target.closest('a');if(a?.matches('[data-my-variant]'))analytics.track('dp_quote_restore',{placement:'header'});
 if(a?.href.includes('/dostavka-i-ustanovka/'))analytics.track('dp_delivery_start',{placement:'delivery'});
});
document.addEventListener('toggle',e=>{if(e.target.matches('.faq-list details,.faq-item'))if(e.target.open)analytics.track('dp_faq_open',{placement:'faq'});},true);
if(location.pathname==='/compare/')analytics.track('dp_compare_view',{placement:'compare'});
const sticky=document.querySelector('.r100-mobile-nav');
if(sticky){const sync=()=>{sticky.hidden=Boolean(document.querySelector('dialog[open]'))||/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)||Boolean(window.visualViewport&&visualViewport.height<innerHeight*.75)};new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});document.addEventListener('focusin',sync);document.addEventListener('focusout',()=>setTimeout(sync,100));visualViewport?.addEventListener('resize',sync);sync();}
