import {fastAsset} from '/performance/media.mjs';
function element(tag,text,className){const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;}
function button(label,text,className){const n=element('button',text,className);n.type='button';n.setAttribute('aria-label',label);return n;}

export function createPhotoGallery(container){
 let photos=[],index=0,modal=null;
 const feature=element('div',null,'choice-photo-feature');
 const open=button('Открыть фотографию крупнее',null,'choice-photo-open'),main=new Image();main.loading='lazy';main.decoding='async';main.width=960;main.height=640;
 open.append(main,element('span','Фото крупнее ↗','choice-photo-enlarge'));
 const previous=button('Предыдущее фото бани','‹','choice-gallery-arrow is-previous'),next=button('Следующее фото бани','›','choice-gallery-arrow is-next');
 const count=element('span',null,'choice-photo-count');count.setAttribute('aria-live','polite');
 feature.append(open,previous,next,count);
 const caption=element('p',null,'choice-photos-label');
 const strip=element('div',null,'choice-photo-strip');strip.setAttribute('aria-label','Выбрать фотографию бани');
 container.append(feature,strip,caption);
 function render(){
  const photo=photos[index];if(!photo)return;
  main.src=photo.image;main.alt=photo.caption;caption.textContent=photo.caption;count.textContent=(index+1)+' / '+photos.length;
  previous.disabled=next.disabled=photos.length<2;
  for(const [i,thumb] of [...strip.children].entries())thumb.setAttribute('aria-pressed',String(i===index));
  if(modal){modal.image.src=photo.largeImage||photo.image;modal.image.alt=photo.caption;modal.caption.textContent=photo.caption;modal.counter.textContent=(index+1)+' / '+photos.length;}
 }
 function move(delta){index=(index+delta+photos.length)%photos.length;render();}
 previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));open.addEventListener('click',()=>openPhoto(index,open));
 function openPhoto(i,opener){
  index=i;
  const dialog=element('dialog',null,'choice-photo-dialog');dialog.setAttribute('aria-label','Фотографии бани');
  const header=element('header'),title=element('h2','Рассмотрите вашу будущую баню'),close=button('Закрыть фотографии','Закрыть ×');header.append(title,close);
  const viewer=element('div',null,'choice-photo-viewer'),large=new Image();large.draggable=false;
  const left=button('Предыдущее фото','‹','choice-gallery-arrow is-previous'),right=button('Следующее фото','›','choice-gallery-arrow is-next');viewer.append(large,left,right);
  left.disabled=right.disabled=photos.length<2;
  const footer=element('div',null,'choice-gallery-caption'),label=element('p'),number=element('span');number.setAttribute('aria-live','polite');footer.append(label,number);
  modal={dialog,image:large,caption:label,counter:number};render();dialog.append(header,viewer,footer);
  left.addEventListener('click',()=>move(-1));right.addEventListener('click',()=>move(1));
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}});
  let start=null;
  large.addEventListener('pointerdown',event=>{if(event.button===0){start={x:event.clientX,y:event.clientY};large.setPointerCapture?.(event.pointerId);}});
  large.addEventListener('pointercancel',()=>{start=null;});
  large.addEventListener('pointerup',event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)move(dx<0?1:-1);});
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{modal=null;dialog.remove();if(opener.isConnected)opener.focus({preventScroll:true});},{once:true});
  document.body.append(dialog);dialog.showModal();
 }
 return nextPhotos=>{
  modal?.dialog.close();photos=nextPhotos.map(photo=>({...photo,...Object.fromEntries(['image','thumbnail','largeImage'].filter(k=>photo[k]).map(k=>[k,fastAsset(photo[k])]))}));index=0;
  strip.replaceChildren(...photos.map((photo,i)=>{
   const b=button('Фото '+(i+1)+': '+photo.caption),image=new Image();image.src=photo.thumbnail||photo.image;image.alt=photo.caption;image.loading='lazy';image.width=240;image.height=170;
   b.append(image);b.addEventListener('click',()=>{index=i;render();});return b;
  }));render();
 };
}
