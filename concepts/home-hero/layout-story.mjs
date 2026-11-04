const area=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
function inside([x,y],polygon){
 let found=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [ax,ay]=polygon[i],[bx,by]=polygon[j];
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)found=!found;
 }
 return found;
}
function join(items){return items.length<2?items[0]||'':items.slice(0,-1).join(', ')+' и '+items.at(-1);}
export function layoutSeparateAgreement(spec){
 const kinds=new Set(spec.items.map(i=>i.kind)),items=[];
 if(kinds.has('bed'))items.push('кровать');
 if(kinds.has('sofa'))items.push('диван');
 if(['shower','sink','toilet','bucket'].some(kind=>kinds.has(kind)))items.push('сантехнику');
 return items.length?join(items).replace(/^./,s=>s.toUpperCase())+' подберём под ваши пожелания и согласуем отдельно.':null;
}
export function layoutOverview(spec){
 const floors=spec.items.filter(item=>item.kind==='floor');
 const names={steam:'Парная',lounge:'Комната отдыха',wash:'Помывочная',shower:'Душевая',wc:'Санузел',bedroom:'Спальня'};
 const rooms=floors.map(floor=>{
  const goods=spec.items.filter(item=>{
   if(!item.xy_mm||!item.size_mm)return false;
   const center=[item.xy_mm[0]+item.size_mm[0]/2,item.xy_mm[1]+item.size_mm[1]/2];
   return floor.polygon_mm?.length&&inside(center,floor.polygon_mm);
  });
  const has=kind=>goods.some(item=>item.kind===kind),count=kind=>goods.filter(item=>item.kind===kind).length;
  const list=[];const kind=floor.room_kind;
  if(kind==='steam'){
   if(has('upper')||has('lower'))list.push('полки для парения');
   if(has('stove'))list.push('печь с дымоходом');
   if(has('bench'))list.push('скамейка');
  }else{
   if(has('table'))list.push('стол');
   if(has('bench'))list.push(count('bench')===2?'две лавки':count('bench')===1?'лавка':'лавки');
   if(has('wash_bench'))list.push(count('wash_bench')===2?'две лавки':'лавка');
   if(has('storage'))list.push('шкаф');
   if(has('open_storage'))list.push('открытые полки');
   if(has('shower'))list.push('душевая зона');
   if(has('sink'))list.push('раковина');
   if(has('toilet'))list.push('унитаз');
   if(has('bed'))list.push('спальное место');
   if(has('sofa'))list.push('диван');
   if(has('kitchen')||has('kitchen_sink'))list.push('кухонная зона');
   if(has('hanger'))list.push('вешалка');
   if(has('shoe_shelf'))list.push('место для обуви');
  }
  const fallback={steam:'Место для вашего банного ритуала.',lounge:'Место, чтобы отдохнуть и выпить чай.',wash:'Отдельное место, чтобы освежиться после парения.',shower:'Отдельное место для душа.',wc:'Отдельный санузел.',bedroom:'Можно остаться до утра.'};
  const description=list.length?join(list).replace(/^./,s=>s.toUpperCase())+'.':fallback[kind]||'Отдельное помещение для вашего отдыха.';
  return {label:names[kind]||floor.label,kind,area:area.format(floor.area_m2)+' м²',description};
 });
 const order=['steam','wash','shower','lounge','wc','bedroom'];
 return rooms.sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
}

export function renderLayoutOverview(spec){
 const section=document.createElement('section');section.className='hh-plan-overview';
 const title=document.createElement('h3');title.textContent='Место для парения и отдыха';
 const grid=document.createElement('div');grid.className='hh-plan-rooms';
 for(const room of layoutOverview(spec)){
  const card=document.createElement('article'),heading=document.createElement('h4'),size=document.createElement('span'),text=document.createElement('p');
  heading.append(document.createTextNode(room.label));size.textContent=room.area;heading.append(size);text.textContent=room.description;card.append(heading,text);grid.append(card);
 }
 section.append(title,grid);
 const agreement=layoutSeparateAgreement(spec);
 if(agreement){const note=document.createElement('p');note.className='hh-plan-agreement';note.textContent=agreement;section.append(note);}
 return section;
}
