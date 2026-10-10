/**
 * Garant Bani V6 atmosphere (presentation only).
 * Uses native CSS animations with IntersectionObserver/visibility pause.
 * No canvas, video, remote imagery, timers, storage, network, or quote changes.
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
  const scenes=[
    ...document.querySelectorAll('.hero,.weather-window,#heroMedia,.bundle-photo,.mood-images .small-media:first-child')
  ];
  const setMotion=()=>{
    root.dataset.motion=!motionQuery.matches&&document.visibilityState==='visible'?'on':'off';
  };
  setMotion();
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
