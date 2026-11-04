// One calculator for a drawing's bill of goods in either package.
// Unresolved goods cannot turn into a zero-price line or a published total.
export function quoteLayout(catalog,bill,packageId){
 if(!['comfort','deluxe'].includes(packageId))throw Error('UNKNOWN_PACKAGE');
 const base=catalog.models[bill.model]?.sizes[bill.size]?.[packageId];
 if(!base)throw Error('UNKNOWN_MODEL_SIZE');
 if(!bill.geometryId||!bill.dimensionSha256||bill.dimensionSha256!==bill.geometryDimensionSha256)throw Error('GEOMETRY_REVISION_MISMATCH');
 if(!Number.isInteger(bill.roomCount)||bill.roomCount<1)throw Error('INVALID_ROOM_COUNT');
 const pending=[...(bill.pending||[])],lines=[],separateAgreementItems=[],bundleUsed=new Map();
 const remaining={...(base.included||{})};
 const amount=n=>Number.isSafeInteger(n)&&n>=0;
 if(!amount(base.priceCents))throw Error('INVALID_BASE_PRICE');
 let known=base.priceCents;
 function unresolved(code,detail){pending.push({code,detail});}
 function rate(sku){const value=catalog.items[sku]?.customerUnitCents?.[bill.model==='kvadro-house'?'house':'standard'];return amount(value)?value:null;}
 if(!Number.isInteger(base.roomCount))unresolved('ROOM_BASE_UNCONFIRMED',bill.model+' '+bill.size);
 else if(bill.roomCount<base.roomCount)unresolved('ROOM_BASE_EXCEEDS_DRAWING',base.roomCount+' > '+bill.roomCount);
 else{
  const quantity=bill.roomCount-base.roomCount;
  const unit=catalog.roomUnitCents[bill.model==='kvadro-house'?'house':'standard'];
  if(!amount(unit))unresolved('ROOM_RATE_MISSING','');
  else{known+=quantity*unit;lines.push({id:'rooms',quantity,unitCents:unit,totalCents:quantity*unit});}
 }
 const seen=new Set();
 for(const line of bill.lines){
  if(!line.id||seen.has(line.id))throw Error('DUPLICATE_BILL_LINE');seen.add(line.id);
  const selection=line.packages?.[packageId]||line;
  const quantity=selection.quantity??1;
  if(!Number.isFinite(quantity)||quantity<=0||quantity>1000)throw Error('INVALID_QUANTITY');
  if(selection.status!=='resolved'){
   unresolved('ITEM_UNCONFIRMED',line.id+': '+line.label);
   lines.push({id:line.id,label:line.label,quantity,totalCents:null,candidates:selection.candidates||[]});continue;
  }
  if(selection.operation==='separate_agreement'){
   const item={id:line.id,label:line.label,quantity,totalCents:null,separateAgreement:true};
   separateAgreementItems.push(item);lines.push(item);continue;
  }
  if(selection.operation==='bundle_part'){
   const parent=bill.lines.find(item=>item.id===selection.bundleLineId&&item.id!==line.id);
   const bundle=parent?.packages?.[packageId]||parent;
   const used=bundleUsed.get(selection.bundleLineId)||0;
   if(!bundle||bundle.status!=='resolved'||bundle.operation!=='extra'||bundle.sku!==selection.bundleSku||rate(bundle.sku)===null||used+quantity>(bundle.quantity??1)){
    unresolved('BUNDLE_NOT_COVERED',line.id);lines.push({id:line.id,quantity,totalCents:null});continue;
   }
   bundleUsed.set(selection.bundleLineId,used+quantity);
   lines.push({id:line.id,label:line.label,quantity,totalCents:0,included:true,bundledWith:parent.id});continue;
  }
  if(selection.operation==='included'){
   const allowance=remaining[selection.inclusionKey];
   if(!Number.isFinite(allowance)||allowance<quantity){unresolved('INCLUDED_QUANTITY_EXCEEDED',line.id);lines.push({id:line.id,quantity,totalCents:null});continue;}
   remaining[selection.inclusionKey]-=quantity;lines.push({id:line.id,quantity,totalCents:0,included:true});continue;
  }
  const unit=rate(selection.sku);
  if(unit===null){unresolved('ITEM_RATE_MISSING',selection.sku||line.id);lines.push({id:line.id,quantity,totalCents:null});continue;}
  let credit=0;
  if(selection.operation==='replace'){
   if(selection.creditApproved!==true){unresolved('REPLACEMENT_CREDIT_UNCONFIRMED',line.id);continue;}
   const value=rate(selection.creditSku);
   if(value===null){unresolved('CREDIT_RATE_MISSING',line.id);continue;}
   if((remaining[selection.creditSku]||0)<quantity){unresolved('CREDIT_QUANTITY_EXCEEDED',line.id);continue;}
   remaining[selection.creditSku]-=quantity;credit=value;
  }else if(selection.operation!=='extra')throw Error('UNKNOWN_LINE_OPERATION');
  // A repeated included SKU consumes its allowance before any charge.
  const covered=selection.operation==='extra'?Math.min(remaining[selection.sku]||0,quantity):0;
  if(covered)remaining[selection.sku]-=covered;
  const total=Math.round((unit-credit)*(quantity-covered));
  known+=total;lines.push({id:line.id,sku:selection.sku,quantity,coveredQuantity:covered,unitCents:unit,creditCents:credit,totalCents:total});
 }
 if(!Number.isSafeInteger(known)||known<0)throw Error('INVALID_TOTAL');
 const complete=pending.length===0;
 const approved=complete&&bill.approval==='approved'&&catalog.approval==='approved';
 return {geometryId:bill.geometryId,dimensionSha256:bill.dimensionSha256,model:bill.model,size:bill.size,package:packageId,
  baseCents:base.priceCents,knownSubtotalCents:known,calculatedTotalCents:complete?known:null,
  publicTotalCents:approved?known:null,status:approved?'approved':complete?'needs_approval':'incomplete',lines,pending,
  priceScope:'bath_and_included_goods',separateAgreementItems};
}

export function quizLayoutQuote(catalog,bills,aliases,quizPlanId,packageId){
 const id=aliases[quizPlanId];
 if(!id)return {status:'unmapped',publicTotalCents:null};
 const bill=bills.find(b=>b.id===id);
 if(!bill)throw Error('QUIZ_BILL_NOT_FOUND');
 return quoteLayout(catalog,bill,packageId);
}
