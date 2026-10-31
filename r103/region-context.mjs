// Keep regional intent in the existing lead form without changing submission or pricing.
const region=document.querySelector('main[data-region]')?.dataset.region;
const dialog=document.querySelector('#inquiry-dialog');
if(region&&dialog){
 const fillRegion=()=>{
  if(!dialog.open)return;
  const input=dialog.querySelector('[name="settlement"]');
  if(input&&!input.value.trim())input.value=region;
 };
 new MutationObserver(fillRegion).observe(dialog,{attributes:true,attributeFilter:['open']});
}
