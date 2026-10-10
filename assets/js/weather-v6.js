/**
 * V6.1 atmospheric clouds: background-only, no precipitation overlays.
 * Single passive scroll listener + rAF updates a CSS offset for the clouds
 * behind the entire site. No network, storage, backend or pricing mutations.
 */
const root=document.documentElement;
const motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');

export function syncAtmosphereText(weather){
  if(weather!=='sun'&&weather!=='rain')return;
  document.querySelectorAll('[data-v6-sun][data-v6-rain]').forEach(node=>{
    node.textContent=weather==='rain'?node.dataset.v6Rain:node.dataset.v6Sun;
  });
}

export function initAtmosphere(){
  const scenes=[...document.querySelectorAll('.hero,.weather-window')];
  let queued=false;
  const updateCloudScroll=()=>{
    queued=false;
    if(root.dataset.motion!=='on'){
      root.style.setProperty('--v61-cloud-scroll','0px');
      return;
    }
    const offset=Math.max(0,Math.min(180,(window.scrollY||0)*.038));
    root.style.setProperty('--v61-cloud-scroll',offset.toFixed(2)+'px');
  };
  const onScroll=()=>{
    if(queued||root.dataset.motion!=='on')return;
    queued=true;
    window.requestAnimationFrame(updateCloudScroll);
  };
  const setMotion=()=>{
    root.dataset.motion=!motionQuery.matches&&document.visibilityState==='visible'?'on':'off';
    updateCloudScroll();
  };
  setMotion();
  window.addEventListener('scroll',onScroll,{passive:true});
  document.addEventListener('visibilitychange',setMotion,{passive:true});
  if(typeof motionQuery.addEventListener==='function'){
    motionQuery.addEventListener('change',setMotion);
  }else if(typeof motionQuery.addListener==='function'){
    motionQuery.addListener(setMotion);
  }
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        entry.target.classList.toggle('is-scene-visible',entry.isIntersecting);
      }
    },{rootMargin:'100px 0px 100px 0px',threshold:0});
    for(const scene of scenes)observer.observe(scene);
  }else{
    for(const scene of scenes)scene.classList.add('is-scene-visible');
  }
}
