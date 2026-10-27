// Presentation-only names. Technical IDs base/comfort, prices and engine remain untouched.
export function publicPackageName(catalog,state){
 if(catalog?.r85)return state?.package==='deluxe'?'Делюкс':state?.options?.length?'Комфорт с улучшениями':'Комфорт';
 const ids=Array.isArray(state?.options)?state.options:[];
 if(!ids.length)return 'Комфорт';
 const b=catalog?.featuredBundle;
 const exact=b && state.model===b.modelId && String(state.size)===String(b.sizeId)
 && ids.length===b.selectedOptionIds.length
 && b.selectedOptionIds.every(id=>ids.includes(id))
 && b.selectedOptionIds.every(id=>{
   const o=catalog.options[id]; if(!o || o.pricingMode!=='area-input')return true;
   return (state.quantities?.[id] ?? 10)===(o.quantity??10);
 });
 return exact?'Делюкс':'Комфорт с выбранными дополнениями';
}
