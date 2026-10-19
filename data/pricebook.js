// The sole source of price amounts is catalog-pricebook.json.
// V6.6 protected preview: status remains DEMO_ONLY until owner approves pricing.
import CATALOG from './catalog-pricebook.json' with {type:'json'};

const subtitles={
  kvadro:'Центральный вход включён в базовую стоимость',
  parus:'Панорамное пространство для отдыха',
  viking:'Арочный вход по центру уже в базовой цене',
  'kvadro-house':'Пространство для отдыха с близкими'
};
const slots={
  kvadro:'catalog-kvadro',
  parus:'catalog-parus',
  viking:'catalog-viking',
  'kvadro-house':'catalog-kvadro-house'
};
const steamOptions=new Set([
  'stove_guard','aspen_backrests','glass_sauna_door_700x1700',
  'remote_firebox_adjacent','led_light_10m'
]);
const models=Object.entries(CATALOG.models).map(([id,model])=>({
  id,name:model.name,subtitle:subtitles[id],
  sizes:{...CATALOG.prices[id]},slot:slots[id],
  widthM:model.widthM??null,sizeKind:model.sizeKind
}));
const options=Object.entries(CATALOG.options).map(([id,option])=>({
  id,name:option.label,price:Number.isSafeInteger(option.unitPriceRub)?option.unitPriceRub*option.quantity:null,
  unitPriceRub:option.unitPriceRub,quantity:option.quantity,unit:option.unit,
  priceStatus:option.priceStatus??'PRELIMINARY',
  compatibleModelId:option.compatibleModelId??null,compatibleSizeId:option.compatibleSizeId??null,
  category:steamOptions.has(id)?'steam':'comfort',
  benefit:option.unitPriceRub===null?'Стоимость уточнит менеджер':option.requiresTechnicalApproval?'Требуется согласование условий установки':'Дополнение по каталогу',
  discountEligible:false,requiresTechnicalApproval:option.requiresTechnicalApproval===true,
  ...(id==='glass_sauna_door_700x1700'?{mutex:'entry-door'}:{})
}));
const bundle=CATALOG.featuredBundle;
export const PRICEBOOK=Object.freeze({
  version:CATALOG.version,
  sourceStatus:CATALOG.status,
  status:CATALOG.status==='APPROVED'?'APPROVED':'DEMO_ONLY',
  currency:'RUB',
  models,options,
  finishes:CATALOG.finishes,
  bundle:{id:bundle.id,name:'Квадро 5 м · Комфорт',modelId:bundle.modelId,
    sizeId:bundle.sizeId,optionIds:[...bundle.selectedOptionIds],discount:bundle.discountRub,quotePendingApproval:false,
    pendingApprovalReason:null,customerDescription:bundle.customerDescription},
  progressive:[],
  baseInclusions:CATALOG.baseInclusions,
  deliveryIncluded:CATALOG.deliveryIncluded
});
export {CATALOG};
