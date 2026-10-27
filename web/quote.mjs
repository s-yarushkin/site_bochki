import {calculateSelection,normalizeSelection,selectionText,money} from './r85-pricing.mjs?v=r93-20261026';
export const MODEL_IDS=['kvadro','viking','parus','kvadro-house'];
export const DEFAULT_STATE={model:'kvadro',size:'500',package:'comfort',options:[],quantities:{},finish:'',roof:''};
export const REGIONS=['Москва','Московская область','Вологодская область','Ярославская область','Другой регион'];
export function normalizeState(catalog,input={}){
 const old=(input.options||[]).filter(id=>Object.hasOwn(catalog.r85.legacyOptionLabels||{},id));
 const current={...input,legacyOptionIds:[...new Set([...(input.legacyOptionIds||[]),...old])],options:(input.options||[]).filter(id=>catalog.r85.items[id]?.kind==='extra')};
 current.quantities=normalizeFloorQuantities(catalog,current);for(const id of current.options){const max=catalog.r85.items[id]?.maxQuantity;if(max&&current.quantities[id]>max)current.quantities[id]=max;}
 // Terrace and wet-room areas may be entered by the visitor, but are never assumed from floor dimensions.
 for(const id of current.options)if(TERRACE_AREA_SKUS.includes(id)&&(!Number.isFinite(Number(current.quantities[id]))||Number(current.quantities[id])<=0))current.quantities[id]=10;
 current.finish=catalog.finishes.body.some(x=>x.id===current.finish)?current.finish:'';
 current.roof=catalog.finishes.roof.some(x=>x.id===current.roof)?current.roof:'';
 return normalizeSelection(catalog.r85,current);
}
export const availableOptions=()=>[];
export function sizeLabel(catalog,model,size){return catalog.r85.models[model]?.sizes[size]?.label||String(size);}
export function floorArea(catalog,model,size){
 if(model==='kvadro-house'){
  const match=/^(\d+)x(\d+)$/.exec(String(size));
  if(!match)throw Error('INVALID_HOUSE_DIMENSIONS');
  return Number(match[1])*Number(match[2]);
 }
 const width=catalog.models[model]?.widthM;
 if(!Number.isFinite(width))throw Error('UNKNOWN_FLOOR_WIDTH');
 return Math.round(Number(size)/100*width*100)/100;
}
// Whole-building flooring products: the visitor pays for the entire area, not 1 square metre.
// Wet-room pans, terraces and benches are excluded: their areas/lengths are design-dependent.
export const AUTO_FLOOR_SKUS=Object.freeze(['OPT_87','OPT_88','OPT_90','OPT_91','OPT_92']);
export const ROOM_AREA_SKUS=Object.freeze(['OPT_56','OPT_61','OPT_89']);
export const TERRACE_AREA_SKUS=Object.freeze(['OPT_84','OPT_85','OPT_220']);
export function normalizeFloorQuantities(catalog, input){
 const model=input.model||'kvadro', size=String(input.size||'500');
 const options=Array.isArray(input.options)?input.options:[];
 const quantities={...(input.quantities||{})};
 if(catalog.models[model] && options.some(id=>AUTO_FLOOR_SKUS.includes(id))){
  const area=floorArea(catalog,model,size);
  for(const id of options)if(AUTO_FLOOR_SKUS.includes(id))quantities[id]=area;
 }
 return quantities;
}
export function pricedOption(catalog,state,id){const q=calculateSelection(catalog.r85,state),row=q.lines.find(x=>x.sku===id);return {quantity:row?.quantity??1,amount:row?.price??null};}
export function calculate(catalog,input){const q=calculateSelection(catalog.r85,input);return {...q,base:q.basePrice,extras:q.extrasRub,installation:q.installationRub,comfort:q.state.package==='deluxe'};}
export function comfortState(catalog,state){return normalizeState(catalog,{...state,package:'deluxe',doors:[{id:'entry',sku:'OPT_17'},{id:'steam',sku:'OPT_14'}],windows:[{id:'window1',sku:'OPT_33'}],options:[],quantities:{}});}
export const rub=money;
export function dossier(catalog,input,now=new Date()){return selectionText(catalog.r85,input)+'\nРасчёт: '+now.toLocaleDateString('ru-RU')+'\nДача Пар · +7 (951) 734-99-99';}
