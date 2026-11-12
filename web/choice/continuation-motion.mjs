const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
// A native scrolling page: no wheel capture, no pointer lock, no video payload.
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const hero=$('.hero'),depthScenes=$$('[data-depth-scene]');let ticking=false;
function depthFrame(){
 ticking=false;if(reduce.matches)return;
 if(hero){const r=hero.getBoundingClientRect();if(r.bottom>=0&&r.top<=innerHeight)hero.style.setProperty('--hero-p',String(Math.max(0,Math.min(1,-r.top/(r.height||1)))));}
 for(const scene of depthScenes){const r=scene.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)continue;scene.style.setProperty('--depth-p',String(Math.max(0,Math.min(1,(innerHeight-r.top)/(innerHeight+r.height)))));}
}
function scheduleDepth(){if(!ticking&&!reduce.matches){ticking=true;requestAnimationFrame(depthFrame);}}
addEventListener('scroll',scheduleDepth,{passive:true});addEventListener('resize',scheduleDepth,{passive:true});scheduleDepth();
reduce.addEventListener('change',()=>{if(hero)hero.style.setProperty('--hero-p','0');for(const scene of depthScenes)scene.style.setProperty('--depth-p','0');scheduleDepth();});
function ritual(key){for(const img of $$('[data-ritual-image]')){const active=img.dataset.ritualImage===key;img.classList.toggle('active',active);img.setAttribute('aria-hidden',String(!active));}for(const b of $$('[data-ritual]'))b.setAttribute('aria-pressed',String(b.dataset.ritual===key));}
for(const b of $$('[data-ritual]'))b.addEventListener('click',()=>{
 ritual(b.dataset.ritual);
 if(matchMedia('(max-width:760px)').matches){const rail=$('.ritual-notes'),target=$(`[data-ritual-step="${b.dataset.ritual}"]`);if(rail&&target)rail.scrollTo({left:target.offsetLeft-rail.offsetLeft,behavior:reduce.matches?'instant':'smooth'});}
});
if('IntersectionObserver'in window){
 const io=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio);if(visible[0])ritual(visible[0].target.dataset.ritualStep)},{threshold:[.4,.7],rootMargin:'-15% 0px -20% 0px'});for(const el of $$('[data-ritual-step]'))io.observe(el);
 const re=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.remove('pending');re.unobserve(e.target)}},{threshold:.08});for(const el of $$('.section-heading,.works-grid .work,.steps li')){el.classList.add('reveal');if(el.getBoundingClientRect().top>innerHeight)el.classList.add('pending');re.observe(el)}document.documentElement.classList.add('js-ready');
}
addEventListener('load',()=>{if(window.ScrollCraft)window.ScrollCraft.mount(document.querySelector('main'));},{once:true});
