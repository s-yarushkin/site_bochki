import {PRICEBOOK} from '../../data/pricebook.js';

export const formatMoney = value => value==null||!Number.isFinite(value)?'По запросу':new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
export const getModel = id => PRICEBOOK.models.find(m=>m.id === id) || null;
export const getOption = id => PRICEBOOK.options.find(o=>o.id === id) || null;

export function resolveOptions(ids,pricebook=PRICEBOOK){
  if(!Array.isArray(ids))throw new Error('OPTIONS_ARRAY_REQUIRED');
  const seen=new Set(), mutex=new Set(), resolved=[];
  for(const id of ids){
    if(typeof id!=='string')throw new Error('INVALID_OPTION_ID');
    const opt=pricebook.options.find(o=>o.id===id);
    if(!opt)throw new Error('UNKNOWN_OPTION_ID:'+id);
    if(seen.has(id))throw new Error('DUPLICATE_OPTION:'+id);
    if(opt.mutex && mutex.has(opt.mutex))throw new Error('INCOMPATIBLE_OPTIONS:'+id);
    seen.add(id);if(opt.mutex)mutex.add(opt.mutex);
    resolved.push(opt);
  }
  return resolved;
}

export function calculateQuote({modelId='kvadro',sizeId='500',optionIds=[],optionQuantities={},bundleId=null}={},pricebook=PRICEBOOK){
  if(pricebook.status!=='DEMO_ONLY' && pricebook.status!=='APPROVED')throw new Error('UNAPPROVED_PRICEBOOK');
  const model=pricebook.models.find(m=>m.id===modelId);
  if(!model)throw new Error('UNKNOWN_MODEL');
  if(!Object.hasOwn(model.sizes,sizeId))throw new Error('UNAVAILABLE_SIZE');
  const basePrice=model.sizes[sizeId];
  if(!Number.isSafeInteger(basePrice)||basePrice<0)throw new Error('INVALID_BASE_PRICE');
  const chosen=resolveOptions(optionIds,pricebook);
  if(!optionQuantities||typeof optionQuantities!=='object'||Array.isArray(optionQuantities))throw new Error('INVALID_OPTION_QUANTITIES');
  if(Object.keys(optionQuantities).length>5)throw new Error('TOO_MANY_OPTION_QUANTITIES');
  for(const [id,qty] of Object.entries(optionQuantities)){
    if(!chosen.some(o=>o.id===id&&o.pricingMode==='area-input'))throw new Error('UNEXPECTED_OPTION_QUANTITY');
    if(!Number.isSafeInteger(qty)||qty<1||qty>40)throw new Error('INVALID_OPTION_QUANTITY');
  }
  for(const option of chosen){
    if((option.compatibleModelId&&option.compatibleModelId!==modelId)||(option.compatibleSizeId&&option.compatibleSizeId!==sizeId))throw new Error('OPTION_NOT_AVAILABLE_FOR_SIZE:'+option.id);
  }
  const floorArea=()=>{
    if(modelId==='kvadro-house'){
      const x=sizeId.match(/^(\d+)x(\d+)$/);
      if(!x)throw new Error('INVALID_FLOOR_SIZE');
      return Number(x[1])*Number(x[2]);
    }
    if(!Number.isFinite(model.widthM))throw new Error('INVALID_FLOOR_WIDTH');
    return Number(sizeId)/100*model.widthM;
  };
  const quantityFor=o=>o.pricingMode==='area-input'?(optionQuantities[o.id]??1):o.pricingMode==='floor-area'?floorArea():o.quantity;
  const priceFor=o=>o.unitPriceRub===null?null:Math.round(o.unitPriceRub*quantityFor(o));
  const missing=chosen.filter(o=>priceFor(o)===null);
  let knownOptionsSubtotal=0;
  for(const o of chosen){
    const amount=priceFor(o);
    if(amount===null)continue;
    if(!Number.isSafeInteger(amount)||amount<0)throw new Error('INVALID_OPTION_PRICE');
    knownOptionsSubtotal+=amount;
    if(!Number.isSafeInteger(knownOptionsSubtotal))throw new Error('PRICE_OVERFLOW');
  }
  const bundle=pricebook.bundle;
  const bundleValid=bundleId===bundle.id && modelId===bundle.modelId && sizeId===bundle.sizeId && bundle.optionIds.every(id=>optionIds.includes(id));
  const quoteRequired=missing.length>0||(bundleValid&&bundle.quotePendingApproval===true);
  const optionsSubtotal=quoteRequired?null:knownOptionsSubtotal;
  const eligible=chosen.filter(o=>o.discountEligible && Number.isSafeInteger(priceFor(o)));
  const eligibleSubtotal=eligible.reduce((s,o)=>s+priceFor(o),0);

  let discount=0,discountType='none',discountRate=0;
  if(bundleValid){
    discount=quoteRequired?0:Math.min(bundle.discount,eligibleSubtotal);discountType='bundle';
  }else{
    discountRate=(pricebook.progressive.find(t=>eligible.length>=t.min)||{rate:0}).rate;
    discount=quoteRequired?0:Math.round(eligibleSubtotal*discountRate/100);
  }
  const installationRub=modelId==='kvadro-house'?Math.round(basePrice*0.10):0;
  const beforeDiscount=quoteRequired?null:basePrice+optionsSubtotal+installationRub;
  const total=quoteRequired?null:beforeDiscount-discount;
  if(total!==null&&(!Number.isSafeInteger(total)||total<0))throw new Error('INVALID_TOTAL');
  return {modelId,sizeId,modelName:model.name,basePrice,optionIds:[...optionIds],
    options:chosen.map(o=>({id:o.id,name:o.name,price:priceFor(o),quantity:quantityFor(o),unit:o.unit,priceStatus:o.priceStatus??'PRELIMINARY'})),
    installationRub,
    optionsSubtotal,knownOptionsSubtotal,eligibleSubtotal,unpricedOptionIds:missing.map(o=>o.id),quoteRequired,
    quoteApprovalReason:bundleValid&&bundle.quotePendingApproval?'Не подтверждена стоимость комплектации электрощита':null,
    discount,discountType,discountRate,total,beforeDiscount,needsConfirmation:true,deliveryKnown:false,
    pricebookVersion:pricebook.version,bundleApplied:bundleValid,pricebookStatus:pricebook.status};
}

export function isBundleApplicable(input){return calculateQuote(input).bundleApplied;}
