(function(){
 'use strict';
 const data=JSON.parse(document.querySelector('#campaign-data').textContent),packages=JSON.parse(document.querySelector('#package-data').textContent),core=globalThis.BFPreview;
 const names={kvadro:'Квадро',parus:'Парус',viking:'Викинг','kvadro-house':'Квадро Хаус'},format=new Intl.NumberFormat('ru-RU'),money=n=>format.format(n)+' ₽';
 const $=s=>document.querySelector(s);let state=core.normalize(data,{model:'parus',size:'550'}),lastSizes={parus:'550'},imageTicket=0;
 try{const q=new URL(location.href).searchParams;if(q.has('model'))state=core.normalize(data,{model:q.get('model'),size:q.get('size'),package:q.get('package')});}catch{}
 function node(tag,text,cls){const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
 for(const model of core.models){const b=node('button',names[model]);b.type='button';b.dataset.model=model;b.addEventListener('click',()=>{lastSizes[state.model]=state.size;state=core.normalize(data,{...state,model,size:lastSizes[model]??state.size});render(true);});$('#models').append(b);}
 function render(changeModel=false){
  const quotes=core.prices(data,state);
  for(const b of $('#models').children)b.setAttribute('aria-pressed',String(b.dataset.model===state.model));
  $('#sizes').replaceChildren(...core.sizes(data,state.model).map(size=>{const b=node('button',size.label);b.type='button';b.dataset.size=size.id;b.setAttribute('aria-pressed',String(size.id===state.size));b.addEventListener('click',()=>{state={...state,size:size.id};lastSizes[state.model]=size.id;render();$('#sizes button[data-size="'+size.id+'"]').focus({preventScroll:true});});return b;}));
  $('#selection').textContent=names[state.model]+' · '+quotes.comfort.sizeLabel;
  for(const key of ['comfort','deluxe']){
   const q=quotes[key];$('[data-reference="'+key+'"]').textContent=money(q.proposedReferencePriceRub);$('[data-saving="'+key+'"]').textContent='Скидка '+money(q.discountRub);$('[data-price="'+key+'"]').textContent='от '+money(q.finalPriceRub);$('[data-description="'+key+'"]').textContent=packages.short[key];$('[data-card="'+key+'"]').classList.toggle('is-selected',state.package===key);$('input[name=package][value="'+key+'"]').checked=state.package===key;
  }
  if(changeModel){const image=$('#scene-image'),ticket=++imageTicket;image.classList.add('is-loading');const target='assets/scene-'+state.model+'.png';image.onload=()=>{if(ticket===imageTicket)image.classList.remove('is-loading');};image.onerror=()=>{if(ticket===imageTicket)image.classList.remove('is-loading');};image.src=target;}
  try{const url=new URL(location.href);url.searchParams.set('model',state.model);url.searchParams.set('size',state.size);url.searchParams.set('package',state.package);history.replaceState(null,'',url);}catch{}
 }
 document.querySelectorAll('input[name=package]').forEach(r=>r.addEventListener('change',()=>{state={...state,package:r.value};render();}));
 let lastOpener=null;
 function open(dialog,opener){lastOpener=opener;dialog.showModal();}
 for(const dialog of document.querySelectorAll('dialog')){dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{if(lastOpener?.isConnected)lastOpener.focus({preventScroll:true});});}
 $('#compare').addEventListener('click',event=>{
  const quotes=core.prices(data,state),table=$('#comparison-table');table.replaceChildren();
  const cap=table.createCaption();cap.className='sr-only';cap.textContent='Состав комплектаций';
  const head=table.createTHead().insertRow();for(const [label,key]of [['Оснащение',null],['Комфорт','comfort'],['Делюкс','deluxe']]){const cell=node('th',label);cell.scope='col';if(key)cell.append(node('small','от '+money(quotes[key].finalPriceRub)));head.append(cell);}
  for(const group of [...new Set(packages.comparison.map(r=>r.group))]){const body=table.createTBody(),row=body.insertRow(),heading=node('th',group);heading.colSpan=3;heading.scope='rowgroup';row.className='group';row.append(heading);for(const entry of packages.comparison.filter(r=>r.group===group)){const tr=body.insertRow(),title=node('th',entry.title);title.scope='row';tr.append(title,node('td',entry.comfort),node('td',entry.deluxe,entry.upgrade?'upgrade':undefined));}}
  $('#compare-selection').textContent=names[state.model]+' · '+quotes.comfort.sizeLabel;open($('#comparison'),event.currentTarget);
 });
 document.querySelectorAll('[data-request]').forEach(b=>b.addEventListener('click',event=>{const q=core.quote(data,state);$('#inquiry-selection').textContent=names[state.model]+' · '+q.sizeLabel+' · '+q.packageName+' · от '+money(q.finalPriceRub);$('#inquiry-status').hidden=true;open($('#inquiry'),event.currentTarget);}));
 $('#inquiry-form').addEventListener('submit',event=>{event.preventDefault();$('#inquiry-status').hidden=false;$('#inquiry-status').textContent='Это предварительный просмотр. Заявка не отправлялась.';});
 render(true);
})();
