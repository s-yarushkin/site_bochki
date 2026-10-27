/** Shared quotation rules. Public books contain selling amounts only. Server books add production costs. */
export const VERSION='DP-DELUXE-ALL-MODELS-20261026-R93';
export const MODELS=['kvadro','viking','parus','kvadro-house'];
export const DELUXE_NAME='Делюкс';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const number=(n,min,max,integer=false)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isInteger(n));
const round=n=>Math.round(n+Number.EPSILON);
export const money=n=>n===null||!Number.isFinite(n)?'Стоимость уточняется':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:Number.isInteger(n)?0:2}).format(n)+' ₽';
// Only fully priced, explicitly offered items belong in online configuration.
// Keep legacy SKUs readable for old links, but never silently price a withdrawn item.
export const isPricedSelectableItem=(item,model)=>Boolean(item&&
  !/тонировк/i.test(item.label||'')&&
  Number.isFinite(item.customerUnitCents)&&
  (model!=='kvadro-house'||Number.isFinite(item.qhAssemblyUnitCents)));
export function normalizeSelection(book,input={}){
 const model=MODELS.includes(input.model)?input.model:'kvadro';
 const size=own(book.models[model].sizes,String(input.size))?String(input.size):Object.keys(book.models[model].sizes)[0];
 const deluxe=input.package==='deluxe'&&Boolean(book.models[model].sizes[size].deluxe);
 const entry={id:'entry',sku:deluxe?'OPT_17':'OPT_16'},steam={id:'steam',sku:'OPT_14'};
 const doors=Array.isArray(input.doors)?input.doors.map(x=>({id:x.id,sku:x.sku})):[entry,steam];
 const windows=Array.isArray(input.windows)?input.windows.map(x=>({id:x.id,sku:x.sku})):[{id:'window1',sku:deluxe?'OPT_33':'OPT_28'}];
 const options=Array.isArray(input.options)?[...input.options]:[];
 const quantities={};for(const id of options)quantities[id]=input.quantities?.[id]??1;
 const wantedPlan=book.planAliases?.[input.planId]||input.planId;const plan=book.plans.find(p=>p.id===wantedPlan&&p.model===model&&p.size===size);
 const normalized={model,size,package:input.package==='deluxe'&&Boolean(book.models[model].sizes[size].deluxe)?'deluxe':'comfort',doors,windows,options,quantities,legacyOptionIds:Array.isArray(input.legacyOptionIds)?input.legacyOptionIds.filter(id=>own(book.legacyOptionLabels||{},id)):[],
  additionalRooms:input.additionalRooms??0,assemblyOnSite:false, // Legacy URL field ignored: no assembly upsell.
  planId:plan?.id??null,legacyPlanId:plan?null:(typeof input.planId==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(input.planId)?input.planId:(typeof input.legacyPlanId==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(input.legacyPlanId)?input.legacyPlanId:null)),mirror:input.mirror===true,finish:typeof input.finish==='string'?input.finish:'',roof:typeof input.roof==='string'?input.roof:''};
 validateSelection(book,normalized);return normalized;
}
export function validateSelection(book,s){
 if(!MODELS.includes(s.model)||!own(book.models[s.model].sizes,s.size))throw Error('UNKNOWN_MODEL_SIZE');
 if(!Array.isArray(s.doors)||s.doors.length<2||s.doors.length>4||!Array.isArray(s.windows)||s.windows.length<1||s.windows.length>4)throw Error('INVALID_OPENING_COUNT');
 if(!number(s.additionalRooms,0,5,true))throw Error('INVALID_ROOM_COUNT');
 if(s.legacyOptionIds&&(!Array.isArray(s.legacyOptionIds)||s.legacyOptionIds.length>20||s.legacyOptionIds.some(id=>!own(book.legacyOptionLabels||{},id))))throw Error('INVALID_HISTORICAL_WISHES');
 if(s.legacyPlanId!==null&&s.legacyPlanId!==undefined&&(typeof s.legacyPlanId!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(s.legacyPlanId)))throw Error('INVALID_HISTORICAL_PLAN');
 const seen=new Set();
 for(const [kind,positions]of [['door',s.doors],['window',s.windows]])for(const p of positions){
  if(!p||typeof p.id!=='string'||seen.has(p.id))throw Error('DUPLICATE_POSITION');seen.add(p.id);
  const validIds=kind==='door'?['entry','steam','door3','door4']:['window1','window2','window3','window4'];
  if(!validIds.includes(p.id))throw Error('INVALID_POSITION');
  const item=book.items[p.sku];
  if(!item||item.kind!==kind)throw Error('WRONG_OPENING_ITEM');
  if(p.id==='steam'&&!item.roles.includes('steam'))throw Error('WRONG_STEAM_DOOR');
  if(p.id==='entry'&&!item.roles.includes('entry'))throw Error('WRONG_ENTRY_DOOR');
 }
 if(!seen.has('entry')||!seen.has('steam')||!seen.has('window1'))throw Error('MISSING_INCLUDED_POSITION');
 if(!Array.isArray(s.options)||s.options.length>40||new Set(s.options).size!==s.options.length)throw Error('DUPLICATE_OPTION');
 const groups=new Set();
 for(const id of s.options){const o=book.items[id];if(!o||o.kind!=='extra'||o.models&&!o.models.includes(s.model))throw Error('INCOMPATIBLE_OPTION');
  if(o.exclusiveGroup){if(groups.has(o.exclusiveGroup))throw Error('INCOMPATIBLE_OPTIONS');groups.add(o.exclusiveGroup);}
  if(!number(s.quantities?.[id],o.minQuantity??1,o.maxQuantity??40,!o.fractional))throw Error('INVALID_QUANTITY');
 }
 if(s.planId&&!book.plans.some(p=>p.id===s.planId&&p.model===s.model&&p.size===s.size))throw Error('WRONG_PLAN');
 return s;
}
export function calculateSelection(book,input={}){
 const s=normalizeSelection(book,input),base=book.models[s.model].sizes[s.size],qh=s.model==='kvadro-house';
 const bundle=s.package==='deluxe'?base.deluxe:null;
 if(s.package==='deluxe'&&!bundle)throw Error('DELUXE_PRICE_MISSING');
 const lines=[],unknown=[];if(bundle?.priceStatus==='calculated')unknown.push('Предварительная цена «Делюкса»: подтвердим помещения и оснащение до заказа');
 function add(positionId,sku,quantity,includedSku=null){
  const item=book.items[sku],credit=includedSku?book.items[includedSku]:null;
  if(!item)throw Error('UNKNOWN_ITEM');
  const role={entry:'Входная дверь',steam:'Дверь в парную',door3:'Дополнительная дверь №1',door4:'Дополнительная дверь №2',window1:'Окно №1',window2:'Окно №2',window3:'Окно №3',window4:'Окно №4'}[positionId];
  const name=role?role+': '+item.label:item.label;
  if(!isPricedSelectableItem(item,s.model)||(credit&&!isPricedSelectableItem(credit,s.model))){unknown.push('Индивидуальное пожелание без утверждённой цены: '+item.label);lines.push({id:positionId,sku,name,quantity,unit:item.unit,price:null,included:includedSku===sku});return;}
  const main=round((item.customerUnitCents-(credit?.customerUnitCents??0))*quantity);
  const assembly=qh?round((item.qhAssemblyUnitCents-(credit?.qhAssemblyUnitCents??0))*quantity):0;
  const factory=item.factoryUnitCents===undefined?null:round((item.factoryUnitCents-(credit?.factoryUnitCents??0))*quantity);
  lines.push({id:positionId,sku,name,quantity,unit:item.unit,price:(main+assembly)/100,included:includedSku===sku,
   ...(factory!==null?{factoryRub:factory/100,assemblyRub:assembly/100}:{})});
 }
 for(const p of s.doors){if(p.id==='steam'&&p.sku==='WOOD_STEAM'){unknown.push('В старом выборе была деревянная дверь парной — требуется подтвердить замену на новую стеклянную');}add(p.id,p.sku,1,p.id==='entry'?(bundle?.defaultEntrySku||'OPT_16'):p.id==='steam'?'OPT_14':null);}
 for(const p of s.windows)add(p.id,p.sku,1,p.id==='window1'?(bundle?.defaultWindowSku||'OPT_28'):null);
 // Deluxe includes these actual goods in the approved bundle price: never charge them twice.
 // An earlier saved URL may contain the same SKU; that does not create an extra purchase.
 const bundleItems={...(base.comfortIncluded||{}),...(bundle?.included||{})};
 const foldingTableReplacesStandard=Boolean(bundle?.included?.OPT_95||s.options.includes('OPT_95'));
 const furniture={tableCount:1,tableType:foldingTableReplacesStandard?'folding':'ordinary',tableLabel:foldingTableReplacesStandard?'Откидной стол вместо штатного обычного':'Обычный стол',ordinaryTableIncluded:!foldingTableReplacesStandard,foldingTableIncluded:foldingTableReplacesStandard,originalTableRrcCreditRub:0,creditPolicy:'NO_CREDIT_BY_OWNER_DECISION'};
 for(const id of s.options){
  const already=bundleItems[id]??0,requested=s.quantities[id];
  if(already){
   if(id==='OPT_87'&&requested>already){unknown.push('Площадь утепления сверх площади «Делюкса» — согласуем');continue;}
   if(id!=='OPT_87'&&requested>already){add('extra:'+id,id,requested-already);continue;}
   continue;
  }
  if(bundle&&['OPT_80','OPT_82','OPT_88'].includes(id)){
   unknown.push('Замена оснащения «Делюкса» — согласуем разницу: '+book.items[id].label);continue;
  }
  add('extra:'+id,id,requested);
 }
 for(const [id,quantity] of Object.entries(bundleItems)){
  const item=book.items[id];lines.push({id:'included:'+id,sku:id,name:item.label+' · включено в '+(bundle?'«Делюкс»':'«Комфорт»'),quantity,unit:item.unit,price:0,included:true,bundle:Boolean(bundle)});
 }
 if(s.additionalRooms)add('rooms','ADDED_ROOM',s.additionalRooms);
 if(base.priceRub===null)unknown.push('Цена комплектации уточняется');
 // The approved Deluxe package has a server-verified exact price and needs no manual quote.
 if(s.legacyOptionIds.length)unknown.push('Ранее выбранное оснащение — пересчитаем по текущей комплектации');
 if(s.legacyPlanId)unknown.push('Ранее выбранная планировка ('+s.legacyPlanId+') — подтвердим актуальный вариант');
 for(const [key,kind,label] of [['finish','body','Цвет корпуса'],['roof','roof','Цвет кровли']])if(s[key]){
  const item=book.finishes?.[kind]?.find(x=>x.id===s[key]);
  if(!item||item.requiresPriceConfirmation||item.priceDeltaRub==null)unknown.push(label+' — подтвердим стоимость выбранного оттенка');
 }
 const plan=book.plans.find(p=>p.id===s.planId);
 if(plan?.wideBody)unknown.push('Более широкий корпус выбранной планировки');
 // Room counts in the factory base are not documented per SKU. Do not invent a surcharge or promise free partitions.
 if(plan&&plan.rooms>(bundle?.roomCount||2))unknown.push('Стоимость помещений выбранной планировки');
 lines.push({id:'furniture',sku:foldingTableReplacesStandard?'OPT_95':'STANDARD_TABLE',name:'Стол в комнате отдыха: '+furniture.tableLabel,quantity:1,unit:'шт',price:0,included:true,factoryRub:0,assemblyRub:0});
 const extrasCents=lines.filter(x=>x.price!==null).reduce((n,l)=>n+round(l.price*100),0);
 const assemblyCents=0; // Quadro House assembly is part of its base. No separate installation upsell.
 const pricedBaseRub=bundle?bundle.priceRub:base.priceRub;
 const knownBaseCents=pricedBaseRub===null?null:round(pricedBaseRub*100);
 const pending=[...new Set(unknown)];
 const knownTotal=knownBaseCents===null?null:(knownBaseCents+extrasCents+assemblyCents)/100;
 const customerTotal=pending.length?null:knownTotal;
 if(customerTotal!==null&&(!number(customerTotal,0,100000000)))throw Error('INVALID_TOTAL');
 const factoryKnown=pending.length===0&&base.factoryRub!==undefined&&lines.every(x=>x.factoryRub!==undefined);
 const production=factoryKnown?base.factoryRub+lines.reduce((v,l)=>v+(l.factoryRub??0),0):null;
 const factoryAssembly=factoryKnown?(base.assemblyRub??0)+lines.reduce((v,l)=>v+(l.assemblyRub??0),0)+assemblyCents/100:null;
 return {wideBody:Boolean(plan?.wideBody),furniture,state:s,modelId:s.model,sizeId:s.size,modelName:book.models[s.model].name,basePrice:pricedBaseRub,comfortPriceRub:base.priceRub,deluxeBundleRub:bundle?pricedBaseRub-base.priceRub:0,deluxeIncluded:bundle?Object.entries(bundle.included).map(([sku,quantity])=>({sku,quantity,name:book.items[sku].label})):[],extrasRub:extrasCents/100,
  installationRub:assemblyCents/100,total:customerTotal,knownTotalRub:knownTotal,quoteRequired:pending.length>0,pendingReasons:pending,lines,
  options:lines.filter(l=>!l.included),optionsSubtotal:pending.length?null:extrasCents/100,knownOptionsSubtotal:extrasCents/100,
  discount:0,discountRate:0,bundleApplied:s.package==='deluxe',pricebookVersion:book.version,priceStatus:bundle?.priceStatus||'approved',calculatedPriceRub:bundle?.priceStatus==='calculated'?knownTotal:null,roomCount:(bundle?.roomCount||2)+s.additionalRooms,pricebookStatus:bundle?.priceStatus==='calculated'?'CALCULATED_PENDING_PRODUCTION':'APPROVED_WITH_PENDING_ITEMS',
  plan:plan?{id:plan.id,title:plan.title,mirror:s.mirror,rooms:plan.rooms}:null,roundingAfterExtras:false,
  ...(factoryKnown?{productionRub:production,productionAssemblyRub:factoryAssembly,grossProfitRub:customerTotal===null?null:Math.round((customerTotal-production-factoryAssembly)*100)/100}: {})};
}
export function selectionText(book,input){
 const q=calculateSelection(book,input),s=q.state;
 const lines=['Дача Пар · ваш вариант',q.modelName+' · '+book.models[s.model].sizes[s.size].label,
  'Комплектация: '+(s.package==='deluxe'?'Делюкс':'Комфорт'),
  'Цена комплектации '+(s.package==='deluxe'?'«Делюкс»':'«Комфорт»')+': '+money(q.basePrice),'Дополнительные изменения: '+money(q.extrasRub),
  ...(s.model==='kvadro-house'?['Сборка на участке включена в стоимость']:[]),
  ...(q.priceStatus==='calculated'?['Предварительно за выбранный вариант: '+money(q.knownTotalRub)]:[]),'Итого за выбранный вариант: '+money(q.total),...q.pendingReasons.map(r=>'Уточним: '+r),
  ...(q.plan?['Планировка: '+q.plan.title+(s.mirror?' · зеркально':'')]:[]),
  ...(s.finish?['Цвет корпуса: '+(book.finishes?.body?.find(x=>x.id===s.finish)?.name||s.finish)]:[]),
  ...(s.roof?['Цвет кровли: '+(book.finishes?.roof?.find(x=>x.id===s.roof)?.name||s.roof)]:[]),'Состав:',
  ...q.lines.map(l=>l.name+' · '+l.quantity+' '+l.unit+' · '+(l.included?'включено':money(l.price))),
  'Доставка, разгрузка и подготовка места рассчитываются по адресу.'];
 return lines.join('\n');
}
