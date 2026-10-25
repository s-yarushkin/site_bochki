import {PRICEBOOK} from '../../data/pricebook.js';

export const formatMoney = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
export const getModel = id => PRICEBOOK.models.find(m=>m.id === id) || null;
export const getOption = id => PRICEBOOK.options.find(o=>o.id === id) || null;

export function resolveOptions(ids){
  if(!Array.isArray(ids))throw new Error('OPTIONS_ARRAY_REQUIRED');
  const seen=new Set(), mutex=new Set(), resolved=[];
  for(const id of ids){
    if(typeof id!=='string')throw new Error('INVALID_OPTION_ID');
    const opt=getOption(id);
    if(!opt)throw new Error('UNKNOWN_OPTION_ID:'+id);
    if(seen.has(id))throw new Error('DUPLICATE_OPTION:'+id);
    if(opt.mutex && mutex.has(opt.mutex))throw new Error('INCOMPATIBLE_OPTIONS:'+id);
    seen.add(id);if(opt.mutex)mutex.add(opt.mutex);
    resolved.push(opt);
  }
  return resolved;
}

export function calculateQuote({modelId='kvadro-house',sizeId='500',optionIds=[],bundleId=null}={},pricebook=PRICEBOOK){
  if(pricebook.status!=='DEMO_ONLY' && pricebook.status!=='APPROVED')throw new Error('UNAPPROVED_PRICEBOOK');
  const model=pricebook.models.find(m=>m.id===modelId);
  if(!model)throw new Error('UNKNOWN_MODEL');
  if(!Object.hasOwn(model.sizes,sizeId))throw new Error('UNAVAILABLE_SIZE');
  const basePrice=model.sizes[sizeId];
  if(!Number.isSafeInteger(basePrice)||basePrice<0)throw new Error('INVALID_BASE_PRICE');
  const chosen=resolveOptions(optionIds);
  const optionsSubtotal=chosen.reduce((sum,opt)=>{
    if(!Number.isSafeInteger(opt.price)||opt.price<0)throw new Error('INVALID_OPTION_PRICE');
    const v=sum+opt.price;if(!Number.isSafeInteger(v))throw new Error('PRICE_OVERFLOW');return v;
  },0);
  const eligible=chosen.filter(o=>o.discountEligible);
  const eligibleSubtotal=eligible.reduce((sum,o)=>sum+o.price,0);
  const bundle=pricebook.bundle;
  const bundleValid=bundleId===bundle.id && modelId===bundle.modelId && sizeId===bundle.sizeId && bundle.optionIds.every(id=>optionIds.includes(id));
  let discount=0, discountType='none',discountRate=0;
  if(bundleValid){discount=Math.min(bundle.discount,eligibleSubtotal);discountType='bundle';}
  else{
    discountRate=(pricebook.progressive.find(t=>eligible.length>=t.min)||{rate:0}).rate;
    discount=Math.round(eligibleSubtotal*discountRate/100);if(discount>0)discountType='progressive';
  }
  const beforeDiscount=basePrice+optionsSubtotal;
  const total=beforeDiscount-discount;
  if(!Number.isSafeInteger(total)||total<0)throw new Error('INVALID_TOTAL');
  return {modelId,sizeId,modelName:model.name,basePrice,optionIds:[...optionIds],options:chosen.map(o=>({id:o.id,name:o.name,price:o.price})),optionsSubtotal,eligibleSubtotal,discount,discountType,discountRate,total,beforeDiscount,needsConfirmation:true,deliveryKnown:false,pricebookVersion:pricebook.version,bundleApplied:bundleValid,pricebookStatus:pricebook.status};
}

export function isBundleApplicable(input){return calculateQuote(input).bundleApplied;}
