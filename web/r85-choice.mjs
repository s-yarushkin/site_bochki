import {calculateSelection,money,isPricedSelectableItem} from './r85-pricing.mjs?v=r93-20261026';
import {AUTO_FLOOR_SKUS,ROOM_AREA_SKUS,TERRACE_AREA_SKUS,floorArea} from './quote.mjs?v=r93-20261026';
const create=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
let book=null,current=null,root=null,siteModels=null;
const emit=patch=>document.dispatchEvent(new CustomEvent('dp:r85-change',{detail:patch}));
const named={entry:'Входная дверь',steam:'Дверь в парную',door3:'Дополнительная дверь',door4:'Ещё одна дверь',window1:'Окно в комнате отдыха',window2:'Второе окно',window3:'Третье окно',window4:'Четвёртое окно'};
function selectField(label,items,value,change,key){const box=create('label',undefined,'r85-field');box.append(create('span',label));const input=create('select');input.dataset.r85Control=key;for(const x of items){const op=create('option',x.label);op.value=x.id;input.append(op)}input.value=value;input.addEventListener('change',()=>change(input.value));box.append(input);return box;}
function section(label,open=false){const d=create('details',undefined,'r85-section');d.open=open;d.append(create('summary',label));return d;}
function render(){
 if(!book||!current||!root)return;
 const focus=document.activeElement?.dataset?.r85Control,open=new Set([...root.querySelectorAll('details[open]')].map(x=>x.dataset.section));
 const q=calculateSelection(book,current);root.replaceChildren();
 const intro=create('div',undefined,'r85-included');intro.append(create('strong',current.package==='deluxe'?'«Делюкс» — готовая продуманная комплектация':'«Комфорт» — всё основное уже включено'));
 intro.append(create('p',current.package==='deluxe'?'Два верхних полка и подспинники для удобного отдыха в парной. Утеплённый пол, вечерняя подсветка и наружный свет уже предусмотрены. Откидной стол помогает освободить проход.':'Печь с дымоходом, стеклянная дверь парной, верхний и выдвижной нижний полки, ограждение печи, входная дверь и окно, стол и лавки, свет, розетки, вентиляция и шкаф уже включены.'));
 intro.append(create('p','Стол в комнате отдыха: '+q.furniture.tableLabel+'.','r85-furniture-note'));
 intro.append(create('p',q.priceStatus==='calculated'&&!q.wideBody?'Предварительно: '+money(q.knownTotalRub)+'. Состав и цену подтвердим до заказа.':q.total===null?'Стоимость выбранного варианта уточним перед заказом.':'Ваш выбранный вариант: '+money(q.total),'r85-current-price'));
 if(current.model==='kvadro-house')intro.append(create('p','Сборка на участке уже включена в цену.','r85-good'));
 root.append(intro);
 if(current.legacyOptionIds?.length){const note=create('div',undefined,'r85-journey-note');note.append(create('strong','Пожелания из прежнего варианта сохранены'));for(const id of current.legacyOptionIds)note.append(create('p',book.legacyOptionLabels[id]));note.append(create('p','Менеджер пересчитает их по текущей комплектации.'));const clear=create('button','Убрать прежние пожелания','r85-outline');clear.type='button';clear.addEventListener('click',()=>emit({legacyOptionIds:[]}));note.append(clear);root.append(note);}
 if(current.legacyPlanId){const note=create('p','Сохранена планировка из прежней ссылки: '+current.legacyPlanId+'. Менеджер уточнит её актуальное исполнение.','r85-journey-note');root.append(note)}
 if(current.planId){root.append(create('p','Выбрана планировка: '+(q.plan?.title||current.planId)+(current.mirror?' · зеркально':''),'r85-journey-note'))}
 const openings=section('1. Больше света и удобный вход',open.has('openings'));openings.dataset.section='openings';
 for(const [kind,positions]of [['door',current.doors],['window',current.windows]]){
  for(const pos of positions){
   const items=Object.values(book.items).filter(x=>isPricedSelectableItem(x,current.model)&&x.kind===kind&&(pos.id==='steam'?x.roles.includes('steam'):pos.id==='entry'?x.roles.includes('entry'):x.id!=='WOOD_STEAM')).map(x=>({id:x.id,label:x.label+(x.id===(pos.id==='entry'?(current.package==='deluxe'?'OPT_17':'OPT_16'):pos.id==='steam'?'OPT_14':pos.id==='window1'?(current.package==='deluxe'?'OPT_33':'OPT_28'):null)?' · включено':'')}));
   const existing=book.items[pos.sku];
   if(existing&&!items.some(x=>x.id===pos.sku))items.unshift({id:pos.sku,label:'Ранее выбрано — '+existing.label+' (согласуем отдельно)'});
   const row=selectField(named[pos.id],items,pos.sku,sku=>emit({[kind==='door'?'doors':'windows']:positions.map(p=>p.id===pos.id?{...p,sku}:p)}),pos.id);
   const line=q.lines.find(x=>x.id===pos.id);row.append(create('small',line?.included?'Уже включено в выбранную комплектацию':line?.price===null?'Стоимость уточним':(line.price>=0?'Доплата: ':'Уменьшение цены: ')+money(Math.abs(line.price))));
   if(!['entry','steam','window1'].includes(pos.id)){const del=create('button','Убрать','r85-text');del.type='button';del.addEventListener('click',()=>emit({[kind==='door'?'doors':'windows']:positions.filter(x=>x.id!==pos.id)}));row.append(del);}
   openings.append(row);
  }
  const max=kind==='door'?4:4;if(positions.length<max){const add=create('button',kind==='door'?'Добавить ещё одну дверь':'Добавить ещё одно окно','r85-outline');add.type='button';add.addEventListener('click',()=>{const available=kind==='door'?['door3','door4']:['window2','window3','window4'];const id=available.find(id=>!positions.some(x=>x.id===id));emit({[kind==='door'?'doors':'windows']:[...positions,{id,sku:kind==='door'?'OPT_17':'OPT_28'}]});});openings.append(add);}
 }
 openings.append(create('p','При замене включённой двери или окна оплачивается разница. Каждая дополнительная дверь и окно считаются отдельно.','r85-note'));root.append(openings);
 const extras=section('2. Сделать отдых удобнее',open.has('extras'));extras.dataset.section='extras';
 const top=['OPT_45','OPT_46','OPT_64','OPT_14','OPT_80','OPT_81','OPT_87','OPT_94','OPT_95','OPT_99','OPT_51'];
 const visible=top.map(id=>book.items[id]).filter(x=>isPricedSelectableItem(x,current.model)&&x.kind==='extra'&&(!x.models||x.models.includes(current.model)));
 const renderItem=(item,container)=>{
  const row=create('div',undefined,'r85-extra'),label=create('label');
  const whole=AUTO_FLOOR_SKUS.includes(item.id),room=ROOM_AREA_SKUS.includes(item.id),terrace=TERRACE_AREA_SKUS.includes(item.id);
  const selected=current.options.includes(item.id);
  const included=Object.hasOwn({...book.models[current.model].sizes[current.size].comfortIncluded,...(current.package==='deluxe'?book.models[current.model].sizes[current.size].deluxe?.included:{})},item.id);
  const bodyArea=whole?floorArea({models:siteModels},current.model,current.size):null;
  const defaultQty=whole?bodyArea:terrace?10:null;
  const actualQty=whole?bodyArea:(current.quantities[item.id]??defaultQty);
  if(room&&!selected){
   // Pans cannot be assumed to cover the whole bath. A drawing is required.
   row.append(create('strong',item.label),create('small','Стоимость рассчитываем по площади парной или моечной на выбранной планировке. Не начисляем 1 м² автоматически.'));
   container.append(row);return;
  }
  const check=create('input');check.type='checkbox';check.checked=selected;
  check.dataset.r85Control=item.id;
  if(included){check.checked=true;check.disabled=true;check.setAttribute('aria-label',item.label+' — уже входит в выбранную комплектацию');}
  check.addEventListener('change',()=>{
   let ids=[...current.options].filter(id=>id!==item.id);
   if(check.checked){if(item.exclusiveGroup)ids=ids.filter(id=>book.items[id].exclusiveGroup!==item.exclusiveGroup);ids.push(item.id);}
   const quantities={...current.quantities};
   if(check.checked){if(whole)quantities[item.id]=bodyArea;else if(terrace)quantities[item.id]=Number(quantities[item.id]||10);else if(!quantities[item.id])quantities[item.id]=1;}
   else delete quantities[item.id];
   emit({options:ids,quantities});
  });
  label.append(check,create('span',item.label));row.append(label);
  const fullQuote=selected?calculateSelection(book,current):calculateSelection(book,{...current,options:[...current.options,item.id],quantities:{...current.quantities,[item.id]:whole?bodyArea:actualQty||1}});
  const line=fullQuote.lines.find(x=>x.id==='extra:'+item.id);
  const customerRub=(Number(item.customerUnitCents||0)+Number(current.model==='kvadro-house'?item.qhAssemblyUnitCents||0:0))/100;
  const amount=selected&&!included?(line?.price??null):(included?0:(actualQty?Math.round(customerRub*actualQty*100)/100:null));
  const meta=included?('Входит в комплектацию'+(whole?' · '+actualQty.toLocaleString('ru-RU')+' м²':'')):
   whole?('На всю баню · '+bodyArea.toLocaleString('ru-RU')+' м² · '+money(amount)):
   terrace?('Площадь '+(actualQty||10)+' м² · '+money(amount)):
   room?('Площадь '+actualQty+' м² · '+money(amount)):
   item.unit==='пог. м'?('За '+(actualQty||1)+' пог. м · '+money(amount)):
   ('Стоимость опции · '+money(amount));
  row.append(create('small',meta));
  if(selected&&!included&&!whole&&item.maxQuantity!==1){
   const qty=create('input');qty.type='number';qty.min=item.minQuantity??1;qty.max=item.maxQuantity??100;
   qty.step=item.fractional?.1:1;qty.value=actualQty??'';qty.dataset.r85Control='qty-'+item.id;
   qty.setAttribute('aria-label',(terrace?'Площадь террасы':room?'Площадь помещения':'Количество')+': '+item.label);
   qty.addEventListener('change',()=>{
    const n=Number(qty.value);if(!Number.isFinite(n)||n<Number(qty.min)||n>Number(qty.max)||(!item.fractional&&!Number.isInteger(n))){qty.setCustomValidity('Проверьте значение');qty.reportValidity();return;}
    qty.setCustomValidity('');emit({quantities:{...current.quantities,[item.id]:n}});
   });
   row.append(create('span',terrace?'Площадь террасы, м²':room?'Площадь помещения, м²':item.unit==='пог. м'?'Длина, пог. м':'Количество, '+item.unit),qty);
  }
  container.append(row);
 };
 visible.forEach(x=>renderItem(x,extras));
 const withdrawn=current.options.filter(id=>!isPricedSelectableItem(book.items[id],current.model));
 if(withdrawn.length){const saved=create('div',undefined,'r85-journey-note');saved.append(create('strong','Ранее выбранные пожелания — без онлайн-цены'));
  for(const id of withdrawn){const item=book.items[id];const line=create('p',(item?.label||id)+' · стоимость согласуем отдельно');
   const remove=create('button','Убрать пожелание','r85-text');remove.type='button';remove.addEventListener('click',()=>emit({options:current.options.filter(x=>x!==id)}));line.append(' ',remove);saved.append(line);}
  extras.append(saved);
 }
 const more=section('Другие пожелания',open.has('more'));more.dataset.section='more';const search=create('input');search.type='search';search.placeholder='Например: душ, утепление, терраса';search.setAttribute('aria-label','Найти улучшение');const list=create('div');
 const filter=()=>{list.replaceChildren();const needle=search.value.toLocaleLowerCase('ru');Object.values(book.items).filter(x=>isPricedSelectableItem(x,current.model)&&x.kind==='extra'&&x.id!=='ADDED_ROOM'&&(!x.models||x.models.includes(current.model))&&(!needle||x.label.toLocaleLowerCase('ru').includes(needle))).slice(0,needle?40:12).forEach(x=>renderItem(x,list));};search.addEventListener('input',filter);more.append(search,list);filter();extras.append(more);root.append(extras);
 const rooms=section('3. Помещения',open.has('rooms'));rooms.dataset.section='rooms';
 if(q.plan)rooms.append(create('p','На выбранной планировке: '+q.plan.rooms+' помещения. Состав и стоимость помещений уточним для вашего заказа.'));
 rooms.append(selectField('Дополнительные комнаты сверх согласованной комплектации',[0,1,2,3,4,5].map(n=>({id:String(n),label:n?String(n):'Не добавлять'})),String(current.additionalRooms),v=>emit({additionalRooms:Number(v)}),'rooms'));
 rooms.append(create('p','В доплату за дополнительную комнату уже входят свет, выключатель и вентиляция. Повторно добавлять их не нужно.','r85-note'));
 root.append(rooms);
 const summary=create('div',undefined,'r85-selection-summary');summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');
 if(current.package==='deluxe'){const included=create('details');included.append(create('summary','Посмотреть всё оснащение Делюкса'));const items=create('ul');q.deluxeIncluded.forEach(x=>items.append(create('li',x.name+(x.sku==='OPT_87'?' · '+x.quantity+' м²':''))));included.append(items);summary.append(included);}
 if(q.quoteRequired){summary.append(create('strong',q.priceStatus==='calculated'?'Предварительный расчёт':'Уточним стоимость выбранного варианта'));q.pendingReasons.forEach(x=>summary.append(create('p',x)));if(q.knownTotalRub!==null)summary.append(create('p','Уже рассчитанная часть: '+money(q.knownTotalRub)));}
 else summary.append(create('p','Выбранные изменения учтены. Доставку, разгрузку и подготовку места рассчитаем по вашему адресу.'));
 const changed=q.lines.filter(x=>!x.included);if(changed.length){const list=create('ul');for(const x of changed)list.append(create('li',x.name+' · '+x.quantity+' '+x.unit+' · '+money(x.price)));summary.append(list);}
 root.append(summary);
 const match=focus?root.querySelector('[data-r85-control="'+CSS.escape(focus)+'"]'):null;match?.focus({preventScroll:true});
 document.querySelector('#r85-variant-note')?.remove();
}
document.addEventListener('dp:r85-render',e=>{book=e.detail.book;current=e.detail.state;siteModels=e.detail.siteModels||window.__r85?.siteModels||null;if(!siteModels)throw Error('SITE_MODELS_REQUIRED_FOR_FLOOR_AREA');if(!root){root=create('section',undefined,'r85-controls');root.id='r85-controls';document.querySelector('#extras-details')?.before(root);}render();});
if(window.__r85)document.dispatchEvent(new CustomEvent('dp:r85-render',{detail:window.__r85}));
