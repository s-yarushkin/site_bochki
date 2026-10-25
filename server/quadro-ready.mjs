// QUADRO READY. Isolated product contract; do not reuse configurable catalog price engine.
// Prices are OWNER PROVISIONAL and must not be promoted to final sale prices until approval.
export const READY_PRICEBOOK = Object.freeze({
  version:'quadro-ready-preview-2026-10-14',
  status:'PROVISIONAL',
  discountVerified:false,
  widthMeters:2.1,
  products:Object.freeze({
    'QR-5-READY':Object.freeze({sku:'QR-5-READY',lengthMeters:5,priceRub:749000}),
    'QR-6-READY':Object.freeze({sku:'QR-6-READY',lengthMeters:6,priceRub:799000})
  }),
  finishes:Object.freeze({
    natural:'Натуральный',
    walnut:'Орех',
    graphite:'Графит'
  })
});
export const READY_SITE_ID='quadro-ready';

function clean(value,max,{required=false}={}){
  if(value==null)value='';
  if(typeof value!=='string'||value.length>max*3)throw new Error('INVALID_FIELD');
  const text=value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g,' ').replace(/\s+/g,' ').trim();
  if(text.length>max||(required&&!text))throw new Error('INVALID_FIELD');
  return text;
}
export function validateReadyLead(value,{pricebook=READY_PRICEBOOK}={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_PAYLOAD');
  if(value.website)throw new Error('SPAM_REJECTED');
  if(!['quote','callback'].includes(value.flow))throw new Error('INVALID_FLOW');
  if(!value.consent||value.consent.accepted!==true||value.consent.version!=='quadro-ready-v1')
    throw new Error('CONSENT_REQUIRED');
  const customer=value.customer;
  if(!customer||typeof customer!=='object'||Array.isArray(customer))throw new Error('INVALID_CUSTOMER');
  const name=clean(customer.name,80,{required:true});
  if(name.length<2)throw new Error('INVALID_NAME');
  const digits=clean(customer.phone,32,{required:true}).replace(/\D/g,'');
  const mobile=digits.length===10&&digits.startsWith('9')?'7'+digits:digits.length===11&&digits.startsWith('8')?'7'+digits.slice(1):digits;
  if(!/^79\d{9}$/.test(mobile)||/^7(\d)\1{9}$/.test(mobile))throw new Error('INVALID_PHONE');
  const contactChannel=customer.contactChannel??'phone';
  if(!['phone','telegram','max'].includes(contactChannel))throw new Error('INVALID_CONTACT_CHANNEL');
  if(value.flow==='callback'&&contactChannel!=='phone')throw new Error('CALLBACK_MUST_BE_PHONE');
  const comment=clean(customer.comment||'',500);
  const district=clean(value.district||'',140);
  if(value.flow==='quote'&&district.length<2)throw new Error('INVALID_DISTRICT');
  if(!value.product||typeof value.product!=='object'||Array.isArray(value.product))throw new Error('INVALID_PRODUCT');
  const sku=value.product.sku;
  if(typeof sku!=='string'||!Object.hasOwn(pricebook.products,sku))throw new Error('INVALID_SKU');
  const finishId=value.product.finishId;
  if(typeof finishId!=='string'||!Object.hasOwn(pricebook.finishes,finishId))throw new Error('INVALID_FINISH');
  const product=pricebook.products[sku];
  const rawSite=value.site||{};
  if(typeof rawSite!=='object'||Array.isArray(rawSite))throw new Error('INVALID_SITE');
  const base=rawSite.base??'unknown',access=rawSite.access??'unknown';
  if(!['unknown','ready','advice'].includes(base)||!['unknown','yes','advice'].includes(access))throw new Error('INVALID_SITE');
  const tracking=value.tracking||{};
  if(typeof tracking!=='object'||Array.isArray(tracking))throw new Error('INVALID_TRACKING');
  const attribution={};
  for(const field of ['utmSource','utmMedium','utmCampaign','utmContent','utmTerm','landingPath']){
    const v=clean(tracking[field]||'',field==='landingPath'?160:100);
    if(v)attribution[field]=v;
  }
  return {
    sourceSite:READY_SITE_ID,
    productKind:'ready-fixed',
    flow:value.flow,name,phone:'+'+mobile,contactChannel,contactAccount:'',comment,district,base,access,
    configuration:{modelId:'quadro-ready',sizeId:String(product.lengthMeters*100),optionIds:[],bundleId:'READY',finishId,finishName:pricebook.finishes[finishId]},
    estimate:{modelId:'quadro-ready',modelName:'КВАДРО READY',sku,lengthMeters:product.lengthMeters,widthMeters:pricebook.widthMeters,
      sizeId:String(product.lengthMeters*100),basePrice:product.priceRub,total:product.priceRub,
      options:[],optionsSubtotal:0,discount:0,bundleApplied:true,
      pricebookVersion:pricebook.version,pricebookStatus:pricebook.status,
      deliveryPriceRub:null,foundationIncluded:false},
    tracking:attribution,
    consentEvidence:{version:'quadro-ready-v1',method:'explicit-checkbox'}
  };
}
export function formatReadyLead(lead,{id=null,createdAt=null}={}){
  const q=lead.estimate,tracking=lead.tracking||{};
  return [
    'НОВАЯ ЗАЯВКА — КВАДРО READY',
    id?'Номер: '+id:null,createdAt?'Создана: '+createdAt:null,
    'Источник: КВАДРО READY',
    'Тип: '+(lead.flow==='quote'?'Узнать доставку':'Обратный звонок'),
    'Модель: '+q.lengthMeters+' × '+q.widthMeters+' м',
    'Цвет: '+lead.configuration.finishName,
    'Комплектация: READY',
    'Цена изделия: '+new Intl.NumberFormat('ru-RU').format(q.total)+' ₽ ('+(q.pricebookStatus==='PROVISIONAL'?'проектная':'утверждённая')+')',
    'Доставка: рассчитывается отдельно. Фундамент не входит.',
    'Имя: '+lead.name,'Телефон: '+lead.phone,
    'Связь: '+({phone:'Звонок',telegram:'Telegram',max:'MAX'}[lead.contactChannel]||'Звонок'),
    'Район: '+(lead.district||'Не указан'),
    'Основание: '+({unknown:'Неизвестно',ready:'Готово',advice:'Нужна консультация'}[lead.base]||'Неизвестно'),
    'Подъезд: '+({unknown:'Неизвестно',yes:'Свободный',advice:'Нужна консультация'}[lead.access]||'Неизвестно'),
    tracking.utmSource?'Реклама: '+tracking.utmSource:null,
    tracking.utmCampaign?'Кампания: '+tracking.utmCampaign:null,
    lead.comment?'Комментарий: '+lead.comment:null
  ].filter(Boolean).join('\n');
}
