// Small page-only helpers: verified Viking plan zoom, old hash compatibility.
const dialog=document.createElement('dialog');dialog.className='r81-zoom-dialog';dialog.innerHTML='<button type="button" aria-label="Закрыть планировку">Закрыть ×</button><img alt="Увеличенная планировка">';document.body.append(dialog);
dialog.querySelector('button').addEventListener('click',()=>dialog.close());
let origin=null;
for(const button of document.querySelectorAll('[data-r81-zoom]'))button.addEventListener('click',()=>{origin=button;const img=dialog.querySelector('img');img.src=button.dataset.r81Zoom;img.alt=button.getAttribute('aria-label');dialog.showModal();});
dialog.addEventListener('close',()=>origin?.focus());
// Legacy anchor: #packages formerly on homepage, now inside Quadro.
if(location.pathname==='/'&&location.hash==='#packages'){
 const url='/bani/kvadro/'+location.search+'#komplektatsii';
 location.replace(url);
}

if(location.pathname==='/bani/kvadro/' && new URLSearchParams(location.search).get('work')==='timber-graphite'){
 addEventListener('load',()=>{const btn=document.querySelector('[data-kq-object="timber-graphite"]');if(btn){document.querySelector('#photos')?.scrollIntoView();requestAnimationFrame(()=>btn.click());}},{once:true});
}
