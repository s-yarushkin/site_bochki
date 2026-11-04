function element(tag,text,className){const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;}
function button(label,text,className){const n=element('button',text,className);n.type='button';n.setAttribute('aria-label',label);return n;}

export function createPhotoGallery(container){
 let photos=[],index=0,modal=null,suppressOpen=false;
 container.setAttribute('aria-roledescription','карусель');
 const stage=element('div',null,'choice-gallery-stage');
 const open=button('Открыть фотографии крупнее',null,'choice-gallery-open');
 const image=new Image();image.width=1200;image.height=800;image.decoding='async';image.draggable=false;open.append(image);
 const previous=button('Предыдущее фото','‹','choice-gallery-arrow is-previous');
 const next=button('Следующее фото','›','choice-gallery-arrow is-next');
 const bottom=element('div',null,'choice-gallery-caption'),caption=element('p'),counter=element('span');counter.setAttribute('aria-live','polite');bottom.append(caption,counter);
 const thumbs=element('div',null,'choice-gallery-thumbs');thumbs.setAttribute('aria-label','Выбрать фотографию');
 stage.append(open,previous,next);container.append(stage,bottom,thumbs);
 function render(){
  const photo=photos[index];if(!photo)return;
  image.src=photo.image;image.alt=photo.caption;caption.textContent=photo.caption;counter.textContent=(index+1)+' / '+photos.length;
  previous.disabled=next.disabled=photos.length<2;
  for(const [i,thumb] of [...thumbs.children].entries())thumb.setAttribute('aria-pressed',String(i===index));
  if(modal){modal.image.src=photo.largeImage||photo.image;modal.image.alt=photo.caption;modal.caption.textContent=photo.caption;modal.counter.textContent=(index+1)+' / '+photos.length;}
 }
 function move(delta){if(!photos.length)return;index=(index+delta+photos.length)%photos.length;render();}
 function keys(event){if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}}
 function swipe(target){
  let start=null;
  target.addEventListener('pointerdown',event=>{if(event.button!==0)return;start={x:event.clientX,y:event.clientY};target.setPointerCapture?.(event.pointerId);});
  target.addEventListener('pointercancel',()=>{start=null;});
  target.addEventListener('pointerup',event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){move(dx<0?1:-1);suppressOpen=true;}});
 }
 previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));stage.addEventListener('keydown',keys);swipe(open);
 open.addEventListener('click',()=>{
  if(suppressOpen){suppressOpen=false;return;}if(!photos.length)return;
  const dialog=element('dialog',null,'choice-photo-dialog');dialog.setAttribute('aria-label','Фотографии бани');
  const header=element('header'),title=element('h2','Рассмотрите вашу будущую баню'),close=button('Закрыть фотографии','Закрыть ×');header.append(title,close);
  const viewer=element('div',null,'choice-photo-viewer'),large=new Image();large.draggable=false;
  const left=button('Предыдущее фото','‹','choice-gallery-arrow is-previous'),right=button('Следующее фото','›','choice-gallery-arrow is-next');viewer.append(large,left,right);
  const footer=element('div',null,'choice-gallery-caption'),label=element('p'),number=element('span');number.setAttribute('aria-live','polite');footer.append(label,number);
  modal={dialog,image:large,caption:label,counter:number};render();dialog.append(header,viewer,footer);
  left.addEventListener('click',()=>move(-1));right.addEventListener('click',()=>move(1));dialog.addEventListener('keydown',keys);swipe(large);
  close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{modal=null;suppressOpen=false;dialog.remove();if(open.isConnected)open.focus({preventScroll:true});},{once:true});
  document.body.append(dialog);dialog.showModal();
 });
 return nextPhotos=>{
  modal?.dialog.close();photos=[...nextPhotos];index=0;suppressOpen=false;
  thumbs.replaceChildren(...photos.map((photo,i)=>{const b=button('Фото '+(i+1)+': '+photo.caption);const img=new Image();img.src=photo.thumbnail||photo.image;img.alt='';img.loading='lazy';img.width=160;img.height=110;b.append(img);b.addEventListener('click',()=>{index=i;render();});return b;}));render();
 };
}
