(function(root){
 'use strict';
 const models=['kvadro','parus','viking','kvadro-house'];
 function sizes(data,model){return [...new Map(data.rows.filter(r=>r.model===model).map(r=>[r.size,{id:r.size,label:r.sizeLabel}])).values()];}
 function normalize(data,input={}){const model=models.includes(input.model)?input.model:'parus',options=sizes(data,model),size=options.some(o=>o.id===input.size)?input.size:options[0].id;return {model,size,package:input.package==='deluxe'?'deluxe':'comfort'};}
 function quote(data,state,pack=state.package){
  const row=data.rows.find(r=>r.model===state.model&&r.size===state.size&&r.package===pack);
  if(!row)throw Error('Unknown model / size / package');
  const discount=row.blackFridayDiscountRub+row.additionalDeluxeDiscountRub;
  if(row.proposedReferencePriceRub-discount!==row.finalPriceRub)throw Error('Inconsistent discount');
  return {...row,discountRub:discount};
 }
 function prices(data,state){return {comfort:quote(data,state,'comfort'),deluxe:quote(data,state,'deluxe')};}
 root.BFPreview={models,sizes,normalize,quote,prices};
})(globalThis);
