// The visible viewport shrinks with the software keyboard on iOS and Android.
// Keep one scroll container inside that viewport; leave desktop behaviour alone.
export function mobileDialog(dialog, win=window, doc=document) {
 const mobile=win.matchMedia('(max-width:760px)');
 let frame=0;
 function revealFocus(){
  const target=doc.activeElement;
  if(!target||!dialog.contains(target)||!target.matches('input,select,textarea'))return;
  const field=target.getBoundingClientRect(),box=dialog.getBoundingClientRect();
  const top=box.top+16,bottom=box.bottom-16;
  if(field.bottom>bottom)dialog.scrollTop+=field.bottom-bottom;
  else if(field.top<top)dialog.scrollTop-=top-field.top;
 }
 function fit(){
  frame=0;
  if(!mobile.matches||!dialog.open){
   dialog.style.removeProperty('--inquiry-visible-height');
   dialog.style.removeProperty('--inquiry-visible-top');
   return;
  }
  const viewport=win.visualViewport;
  dialog.style.setProperty('--inquiry-visible-height',`${viewport?.height||win.innerHeight}px`);
  dialog.style.setProperty('--inquiry-visible-top',`${viewport?.offsetTop||0}px`);
  revealFocus();
 }
 function schedule(){if(!frame)frame=win.requestAnimationFrame(fit);}
 win.visualViewport?.addEventListener('resize',schedule,{passive:true});
 win.visualViewport?.addEventListener('scroll',schedule,{passive:true});
 win.addEventListener('resize',schedule,{passive:true});
 mobile.addEventListener('change',schedule);
 dialog.addEventListener('focusin',schedule);
 dialog.addEventListener('close',schedule);
 return {open(){
  fit();
  if(mobile.matches){
   dialog.scrollTop=0;
   dialog.setAttribute('tabindex','-1');
   dialog.focus({preventScroll:true});
  }
  return mobile.matches;
 }};
}
