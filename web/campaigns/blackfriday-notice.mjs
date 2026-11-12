import {campaignPhase} from './blackfriday.mjs';
const closeKey='dp_bf_notice_closed_2026';
export function promotionUrl(href){
 const current=new URL(href),url=new URL('/blackfriday/',current.origin);
 for(const [key,value]of current.searchParams)if(/^(utm_(source|medium|campaign|content|term)|yclid|gclid|dp_ref|dp_ctx)$/.test(key))url.searchParams.set(key,value);
 for(const [target,source]of [['model','bath'],['size','bathSize'],['package','package']])if(current.searchParams.has(source))url.searchParams.set(target,current.searchParams.get(source));
 return url.pathname+url.search;
}
export function noticePosition(anchor,width,height,viewport,protectedRects=[]){
 const gap=14,edge=12,clampX=x=>Math.max(edge,Math.min(viewport.width-width-edge,x));
 const below=Math.max(anchor.bottom,...protectedRects.filter(r=>r.left<anchor.right&&r.right>anchor.left).map(r=>r.bottom));
 const positions=[{x:anchor.right+gap,y:anchor.top},{x:clampX(anchor.right-width),y:anchor.top-height-gap},{x:clampX(anchor.right+gap),y:below+gap},{x:viewport.width-width-edge,y:viewport.height-height-edge},{x:edge,y:anchor.top-height-gap}];
 const intersects=(p,r)=>p.x<r.right+8&&p.x+width>r.left-8&&p.y<r.bottom+8&&p.y+height>r.top-8;
 return positions.find(p=>p.x>=edge&&p.y>=edge&&p.x+width<=viewport.width-edge&&p.y+height<=viewport.height-edge&&!protectedRects.some(r=>intersects(p,r)))??null;
}
export function mountBlackFridayNotice(anchor){
 if(!anchor||campaignPhase()!=='active')return;
 try{if(sessionStorage.getItem(closeKey)==='1')return;}catch{}
 let eligible=false,timer=null,closed=false,shown=false,frame=0;
 const aside=document.createElement('aside');aside.className='bf-price-notice';aside.hidden=true;aside.setAttribute('aria-label','Чёрная пятница');
 const close=document.createElement('button');close.type='button';close.className='bf-price-notice-close';close.setAttribute('aria-label','Закрыть баннер чёрной пятницы');close.textContent='×';
 const link=document.createElement('a');link.className='bf-price-notice-link';
 const image=new Image();image.alt='Чёрная пятница · ДачаПар';image.width=640;image.height=360;image.decoding='async';
 const variant=Math.random()<.5?'parus':'kvadro-house';
 const label=document.createElement('span');label.textContent='У нас чёрная пятница с 11 по 21 ноября!';
 link.append(image,label);aside.append(link,close);document.body.append(aside);
 link.addEventListener('click',()=>{link.href=promotionUrl(location.href);});
 function cancel(){clearTimeout(timer);timer=null;}
 function place(){
  frame=0;if(closed)return;
  if(!eligible||document.hidden||document.querySelector('dialog[open]')||campaignPhase()!=='active'){aside.hidden=true;return;}
  const rect=anchor.getBoundingClientRect(),width=Math.min(innerWidth<=760?260:300,innerWidth-24),height=innerWidth<=760?80:Math.round(width*9/16)+54;
  const protectedRects=[...document.querySelectorAll('[data-package-cards],[data-plan-request],[data-sizes],#models,.site-header')].map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height&&r.bottom>0&&r.top<innerHeight);
  const p=noticePosition(rect,width,height,{width:innerWidth,height:innerHeight},protectedRects);
  if(!shown||!p){aside.hidden=true;return;}
  aside.style.left=Math.round(p.x)+'px';aside.style.top=Math.round(p.y)+'px';aside.style.width=width+'px';link.href=promotionUrl(location.href);aside.hidden=false;
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(place);};
 function arm(){
  cancel();if(!eligible||closed||document.hidden)return;
  if(shown){schedule();return;}
  timer=setTimeout(()=>{timer=null;if(!eligible||closed||document.hidden)return;shown=true;image.src='/campaigns/assets/notice-'+variant+'.webp';schedule();},1500);
 }
 close.addEventListener('click',()=>{closed=true;cancel();aside.remove();observer.disconnect();mutation.disconnect();removeEventListener('scroll',schedule);removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',visibility);try{sessionStorage.setItem(closeKey,'1');}catch{}});
 const observer=new IntersectionObserver(entries=>{eligible=entries[0].isIntersecting&&entries[0].intersectionRatio>=.12;if(eligible)arm();else{cancel();aside.hidden=true;}},{threshold:[0,.12,.5,1]});observer.observe(anchor);
 const mutation=new MutationObserver(schedule);mutation.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 function visibility(){if(document.hidden){cancel();aside.hidden=true;}else arm();}
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule,{passive:true});document.addEventListener('visibilitychange',visibility);
}
