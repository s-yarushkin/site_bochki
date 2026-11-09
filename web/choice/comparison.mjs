import {PACKAGE_NAMES,COMPARISON,PACKAGE_NOTES} from './packages.mjs?v=packages-contact-20261106';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(n);
export function openPackageComparison({selection,prices={},opener}){
 const dialog=node('dialog',null,'choice-compare-dialog');dialog.setAttribute('aria-labelledby','choice-comparison-title');
 const header=node('header'),title=node('h2','Сравнение комплектаций');title.id='choice-comparison-title';
 const close=node('button','Закрыть ×');close.type='button';close.setAttribute('aria-label','Закрыть сравнение комплектаций');close.addEventListener('click',()=>dialog.close());header.append(title,close);
 const scroll=node('div',null,'choice-comparison-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','Оснащение Комфорт и Делюкс');
 const table=node('table');table.createCaption().textContent='Полный состав комплектаций выбранной бани';
 const columns=document.createElement('colgroup');for(const width of ['26%','37%','37%']){const col=document.createElement('col');col.style.width=width;columns.append(col);}table.append(columns);
 const top=table.createTHead().insertRow();for(const [key,label]of [['','Что входит'],['comfort',PACKAGE_NAMES.comfort],['deluxe',PACKAGE_NAMES.deluxe]]){const th=node('th',label);th.scope='col';if(key&&Number.isFinite(prices[key]))th.append(node('span',money(prices[key]),'choice-compare-price'));top.append(th);}
 for(const group of [...new Set(COMPARISON.map(row=>row.group))]){
  const body=table.createTBody(),section=body.insertRow(),heading=node('th',group);heading.colSpan=3;heading.scope='rowgroup';section.className='choice-comparison-group';section.append(heading);
  for(const row of COMPARISON.filter(item=>item.group===group)){const entry=body.insertRow(),name=node('th',row.title);name.scope='row';entry.append(name,node('td',row.comfort),node('td',row.deluxe,row.upgrade?'is-upgrade':undefined));}
 }
 scroll.append(table);dialog.append(header,node('p',selection,'choice-compare-selection'),node('p','В «Комфорте» уже есть всё основное для банного отдыха. Зелёным отмечено, что «Делюкс» добавляет или улучшает.','choice-compare-intro'),scroll,node('p',PACKAGE_NOTES.join(' '),'choice-compare-note'));
 dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});},{once:true});document.body.append(dialog);dialog.showModal();close.focus({preventScroll:true});
}
