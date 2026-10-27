// Native scrolling, one scheduled read per frame, no scroll interception.
export function closestScene(rects, viewportHeight) {
  const line=viewportHeight*.52;
  return rects.reduce((best,rect,index)=>Math.abs(rect.top+rect.height/2-line)<Math.abs(rects[best].top+rects[best].height/2-line)?index:best,0);
}
export function setupJourney(doc,env) {
  const root=doc.querySelector('.journey'),copies=[...doc.querySelectorAll('.journey-copy')],frames=[...doc.querySelectorAll('.journey-frame')];
  if(!root||copies.length!==3||frames.length!==3)return;
  const query=env.matchMedia('(min-width: 1001px) and (min-height: 650px) and (prefers-reduced-motion: no-preference)');
  let enabled=false,queued=0,inView=true,active=-1;
  function select(index){
    if(active===index)return;active=index;
    frames.forEach((frame,i)=>{frame.classList.toggle('is-current',i===index);frame.inert=i!==index;frame.setAttribute('aria-hidden',String(i!==index));});
    copies.forEach((copy,i)=>copy.classList.toggle('is-current',i===index));
  }
  function update(){queued=0;if(enabled)select(closestScene(copies.map(c=>c.getBoundingClientRect()),env.innerHeight));}
  function schedule(){if(enabled&&inView&&!queued)queued=env.requestAnimationFrame(update);}
  function sync(){
    enabled=query.matches&&!env.navigator.connection?.saveData;
    root.classList.toggle('journey-ready',enabled);active=-1;
    if(enabled)update();else frames.forEach(frame=>{frame.classList.remove('is-current');frame.inert=false;frame.removeAttribute('aria-hidden');});
    if(!enabled)copies.forEach(copy=>copy.classList.remove('is-current'));
  }
  query.addEventListener?.('change',sync);env.navigator.connection?.addEventListener?.('change',sync);
  env.addEventListener('scroll',schedule,{passive:true});env.addEventListener('resize',()=>{if(enabled)update();},{passive:true});
  if(env.IntersectionObserver)new env.IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView)schedule();},{rootMargin:'150px'}).observe(root);
  sync();
}
if(typeof document!=='undefined')setupJourney(document,window);
