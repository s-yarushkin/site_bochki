// Exact known object IDs only; no arbitrary query selectors or external URLs.
const valid={parus:new Set(['slats','terrace','cream','timber']),'kvadro-haus':new Set(['terrace-window','timber-terrace','panoramic','grey','wide-glazing'])};
const model=location.pathname.includes('/bani/parus/')?'parus':location.pathname.includes('/bani/kvadro-haus/')?'kvadro-haus':null;
const requested=new URLSearchParams(location.search).get('work');
if(model&&valid[model].has(requested)){
 const attr=model==='parus'?'data-pp-object':'data-qh-object';
 const selector='['+attr+'="'+requested+'"]';
 addEventListener('load',()=>{const target=document.querySelector(selector);if(target){const section=document.getElementById('photos');section?.scrollIntoView({block:'start'});requestAnimationFrame(()=>target.click());}}, {once:true});
}
