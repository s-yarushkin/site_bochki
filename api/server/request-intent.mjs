import {readFileSync} from 'node:fs';
const albumPlans=JSON.parse(readFileSync(new URL('../data/request-layouts.json',import.meta.url),'utf8')).plans;
export const INTENT_VERSION='request-intent-20261109';
const models={kvadro:'Квадро',parus:'Парус',viking:'Викинг','kvadro-house':'Квадро Хаус'};
const packages={comfort:'Комфорт',deluxe:'Делюкс'};
const entries={model_offer:'Карточка модели',plan_request:'Запрос из конкретной планировки',site_capture:'Общая форма сайта',header_callback:'Кнопка в шапке сайта',footer_capture:'Форма внизу сайта',capture_bar:'Закреплённая форма связи',quiz:'Результат подбора в квизе',calculator:'Форма расчёта',production:'Запрос показа производства',foundation:'Консультация по основанию',delivery:'Консультация по доставке',unknown:'Источник формы не подтверждён'};
const sources=new Set(['explicit','default','link','restored','request','unknown']);
const actionNames={dp_model_select:'Выбрал модель',dp_size_select:'Выбрал размер',dp_package_select:'Выбрал комплектацию',dp_plan_select:'Выбрал планировку',dp_plan_view:'Открыл планировку',dp_3d_open:'Открыл 3D',dp_gallery_open:'Открыл фотографии',dp_quiz_start:'Начал подбор',dp_quiz_result:'Посмотрел результат подбора',dp_quiz_completed:'Завершил подбор',dp_form_open:'Открыл форму заявки'};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const size=v=>typeof v==='string'&&/^(?:[456][05]0|[456]x[456])$/.test(v);
const plan=v=>typeof v==='string'&&/^(?:dp3d-\d{2}|DP-PL-\d{3}|p\d{1,2})$/.test(v);
export function normalizeRequestIntent(input,lead,{modelBook={},planBook=[],finishLabels={},roofLabels={}}={}){
 if(!object(input)||input.version!==INTENT_VERSION)return undefined;
 const result={version:INTENT_VERSION,entry:Object.hasOwn(entries,input.entry)?input.entry:'unknown',selection:{},sources:{},channelSource:['explicit','default'].includes(input.channelSource)?input.channelSource:'unknown',recentActions:[],historyStatus:'unavailable'};
 if(typeof input.pagePath==='string'&&input.pagePath.length<=120&&/^\/(?:[a-z][a-z0-9_-]{0,50}\/)*(?:[a-z][a-z0-9_-]{0,50}\.html)?$/.test(input.pagePath)&&!/^\/(?:api|crm)\//.test(input.pagePath))result.pagePath=input.pagePath;
 const v=object(input.selection)?input.selection:{};
 if(Object.hasOwn(models,v.model))result.selection.model=v.model;
 if(size(v.size)&&(!result.selection.model||!modelBook[result.selection.model]||Object.hasOwn(modelBook[result.selection.model].sizes,v.size)))result.selection.size=v.size;
 if(Object.hasOwn(packages,v.package))result.selection.package=v.package;
 if(plan(v.plan)&&(!planBook.length||planBook.some(p=>p.id===v.plan)||albumPlans.some(p=>p.id===v.plan)))result.selection.plan=v.plan;
 for(const [key,labels]of [['finish',finishLabels],['roof',roofLabels]])if(Object.hasOwn(labels,v[key])){result.selection[key]=v[key];(result.labels??={})[key]=labels[v[key]];}
 for(const key of Object.keys(result.selection))result.sources[key]=sources.has(input.sources?.[key])?input.sources[key]:'unknown';
 const cfg=lead.configuration?.selection??lead.journeyContext?.variant?.configuration?.selection;
 for(const key of ['model','size','package'])if(cfg?.[key]){if(result.selection[key]!==cfg[key])result.sources[key]='unknown';result.selection[key]=cfg[key];}
 for(const [key,labels]of [['finish',finishLabels],['roof',roofLabels]]){const name=(lead.configuration??lead.journeyContext?.variant?.configuration)?.[key==='finish'?'finishName':'roofName'];if(name){const actual=Object.keys(labels).find(id=>labels[id]===name);if(actual){if(result.selection[key]!==actual)result.sources[key]='unknown';result.selection[key]=actual;(result.labels??={})[key]=name;}}}
 const album=albumPlans.find(p=>p.id===result.selection.plan);
 const p=lead.planRequest??(result.entry==='plan_request'?(planBook.find(p=>p.id===result.selection.plan)??(album?{id:album.id,size:album.size,model:album.models.includes(result.selection.model)?result.selection.model:album.models[0]}:null)):null);
 if(p){result.entry='plan_request';for(const [key,value]of Object.entries({model:p.model,size:p.size,plan:p.id})){if(!value)continue;if(result.selection[key]!==value||result.sources[key]!=='explicit')result.sources[key]='request';result.selection[key]=value;}}
 return result;
}
export function normalizeRecentActions(input){
 if(!Array.isArray(input))return [];
 return input.slice(-3).filter(e=>object(e)&&Object.hasOwn(actionNames,e.event_code)).map(e=>{const out={event_code:e.event_code};if(Object.hasOwn(models,e.model_id))out.model_id=e.model_id;if(size(e.size_id))out.size_id=e.size_id;if(plan(e.plan_id))out.plan_id=e.plan_id;if(Object.hasOwn(packages,e.package))out.package=e.package;return out;});
}
const sizeText=v=>v.includes('x')?v.replace('x',' × ')+' м':String(Number(v)/100).replace('.',',')+' м';
export function requestIntentLines(intent){
 if(!intent)return ['КОНТЕКСТ ОБРАЩЕНИЯ','Старая форма: явный выбор и источник параметров не зафиксированы.'];
 const lines=['КОНТЕКСТ ОБРАЩЕНИЯ','Откуда: '+entries[intent.entry]+(intent.pagePath?' · '+intent.pagePath:'')];
 if(intent.channelSource==='default')lines.push('Способ связи предложен формой и подтверждён отправкой заявки.');
 else if(intent.channelSource==='explicit')lines.push('Способ связи выбран клиентом.');
 const values={model:v=>'Модель '+models[v],size:v=>'размер '+sizeText(v),package:v=>'«'+packages[v]+'»',plan:v=>'планировка '+v.toUpperCase(),finish:v=>'цвет корпуса '+intent.labels?.finish,roof:v=>'кровля '+intent.labels?.roof};
 for(const [source,label]of [['explicit','Клиент выбрал на странице'],['request','Запрос относится к'],['link','Задано адресом страницы'],['restored','Восстановлено из сохранённого варианта'],['default','На экране по умолчанию'],['unknown','Происхождение не подтверждено']]){
  const parts=Object.entries(intent.selection).filter(([key])=>intent.sources[key]===source).map(([key,value])=>values[key](value));if(parts.length)lines.push(label+': '+parts.join(' · '));
 }
 if(!Object.keys(intent.selection).length)lines.push(intent.entry==='quiz'?'Пожелания — в ответах квиза ниже.':'Конкретная баня в запросе не указана.');
 if(intent.recentActions?.length){lines.push('Последние действия после согласия:');for(const e of intent.recentActions)lines.push('• '+actionNames[e.event_code]+[models[e.model_id],e.size_id&&sizeText(e.size_id),e.plan_id?.toUpperCase(),packages[e.package]].filter(Boolean).map(x=>' · '+x).join(''));}
 else lines.push('Последние действия: подтверждённой истории нет.');
 return lines;
}
export function genericWithoutChoice(lead){return ['site_capture','header_callback','footer_capture','capture_bar','delivery','production','foundation'].includes(lead.intentContext?.entry)&&!Object.values(lead.intentContext.sources).includes('explicit')&&!Object.values(lead.intentContext.sources).includes('request');}
export function decorateMaxLead(base,lead,meta={}){
 const context=requestIntentLines(lead.intentContext).join('\n');const lines=base.split('\n');const index=lines.findIndex(line=>/^(?:Связаться|Ответить|Канал связи):/.test(line));lines.splice(index>=0?index+1:1,0,'',context,'');let text=lines.join('\n');
 if(text.length<=4000)return text;
 // MAX accepts 4000 characters. The immutable full snapshot stays in the CRM.
 const money=v=>new Intl.NumberFormat('ru-RU').format(v)+' ₽';
 const main=['НОВАЯ ЗАЯВКА — ДАЧА ПАР',meta.id&&'Номер: '+meta.id,'Имя: '+(lead.name||'Не указано'),'Телефон: '+lead.phone,'Канал связи: '+lead.contactChannel,context];
 if(lead.contactAccount)main.push('Контакт в мессенджере: '+lead.contactAccount);
 if(lead.estimate&&!genericWithoutChoice(lead)){const q=lead.estimate;main.push('РАСЧЁТ: '+(q.modelName||models[q.modelId]||'баня'),Number.isFinite(q.total)?'ИТОГО: '+money(q.total):'', 'Опций: '+(q.options?.length??0));}
 if(lead.comment)main.push('Комментарий: '+lead.comment);
 main.push('Полная комплектация и данные заявки: https://xn--80aaan1dh9b.xn--p1ai/manager.html'+(meta.id?'?lead='+encodeURIComponent(meta.id):''));
 return main.filter(Boolean).join('\n');
}
