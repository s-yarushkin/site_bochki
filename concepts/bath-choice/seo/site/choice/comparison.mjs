import {PACKAGE_NAMES,COMPARISON} from './packages.mjs?v=seo-20261105';

function node(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
export function openPackageComparison({selection,opener}){
 const dialog=node('dialog',null,'choice-compare-dialog');dialog.setAttribute('aria-labelledby','choice-comparison-title');
 const header=node('header'),title=node('h2','Сравните комплектации');title.id='choice-comparison-title';
 const close=node('button','Закрыть ×');close.type='button';close.addEventListener('click',()=>dialog.close());header.append(title,close);
 const selected=node('p',selection,'choice-compare-selection');
 const scroll=node('div',null,'choice-comparison-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','Подробное сравнение комплектаций');
 const table=node('table');table.createCaption().textContent='Что предусмотрено в каждой комплектации';
 const top=table.createTHead().insertRow();
 for(const label of ['Оснащение',PACKAGE_NAMES.comfort,PACKAGE_NAMES.deluxe]){const th=node('th',label);th.scope='col';top.append(th);}
 for(const group of [...new Set(COMPARISON.map(row=>row.group))]){
  const body=table.createTBody(),section=body.insertRow(),heading=node('th',group);heading.colSpan=3;heading.scope='rowgroup';section.className='choice-comparison-group';section.append(heading);
  for(const row of COMPARISON.filter(item=>item.group===group)){
   const entry=body.insertRow(),name=node('th',row.title);name.scope='row';entry.append(name,node('td',row.comfort),node('td',row.deluxe));
  }
 }
 scroll.append(table);dialog.append(header,selected,scroll);
 dialog.addEventListener('close',()=>{dialog.remove();if(opener.isConnected)opener.focus({preventScroll:true});},{once:true});
 document.body.append(dialog);dialog.showModal();
}
