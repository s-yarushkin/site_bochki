import {readFileSync} from 'node:fs';
import {resolveR85Configuration,formatR85Lead} from './r85-quote.mjs';
const photos=JSON.parse(readFileSync(new URL('../data/photo-references.json',import.meta.url),'utf8'));
const purposes=new Set(['quote','callback','plan','photo','delivery','selection_help']);
export function validateJourneyContext(input,flow,{finishLabels={},roofLabels={}}={}){
 if(input===undefined)return undefined;
 if(!input||typeof input!=='object'||Array.isArray(input)||!purposes.has(input.purpose))throw Error('INVALID_JOURNEY_CONTEXT');
 const result={purpose:input.purpose};
 if(typeof input.district==='string'&&input.district.length<=140)result.district=input.district.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
 if(typeof input.pagePath==='string'&&/^\/[a-z0-9/_.-]{0,120}$/.test(input.pagePath))result.pagePath=input.pagePath;
 if(input.reference!==undefined){
  const r=input.reference,p=photos.find(p=>p.model===r?.model&&p.objectId===r?.objectId&&p.photoId===r?.photoId);
  if(!p)throw Error('UNKNOWN_PHOTO_REFERENCE');
  result.reference={...p,url:new URL(p.url,'https://xn--80aaan1dh9b.xn--p1ai').href};
 }
 if(input.configuration!==undefined){
  if(flow!=='callback')throw Error('UNEXPECTED_CONTEXT_CONFIGURATION');
  const resolved=resolveR85Configuration(input.configuration);
  for(const [field,labels,target]of [['finish',finishLabels,'finishName'],['roof',roofLabels,'roofName']])if(input.configuration[field]!==undefined){if(!Object.hasOwn(labels,input.configuration[field]))throw Error('UNKNOWN_FINISH');resolved.configuration[target]=labels[input.configuration[field]];}
  // Keep a callback a callback. The saved variant is context, not a qualified quote.
  result.variant={configuration:resolved.configuration,estimate:resolved.estimate};
 }
 return result;
}
export function journeyText(lead){
 const c=lead.journeyContext;if(!c)return '';
 const labels={quote:'Расчёт выбранной бани',callback:'Обратный звонок',plan:'Планировка',photo:'Баня по фотоориентиру',delivery:'Доставка и участок',selection_help:'Помощь с выбором'};
 const lines=['','ЦЕЛЬ ОБРАЩЕНИЯ: '+labels[c.purpose]];
 if(c.pagePath)lines.push('Страница: '+c.pagePath);
 if(c.reference)lines.push('Фотоориентир: '+c.reference.title+' · '+c.reference.caption,'Объект: '+c.reference.objectId+' · фото: '+c.reference.photoId,c.reference.url,'Это ориентир пожеланий. Точное исполнение и стоимость согласовать отдельно.');
 if(c.variant)lines.push('ВАРИАНТ ПЕРЕД ЗВОНКОМ',formatR85Lead({...lead,...c.variant,district:c.district}, {}));
 return lines.join('\n');
}
