/** P0 legacy Parus stage geometry safeguard, designed for targeted activation only.
 * The live parus-media/widget source must be acquired before enabling this on production.
 * It never modifies a thumbnail and never changes media URL or object identity.
 */
export function detectAndRepairTinyStageImage(root,{repair=true}={}) {
  if(!(root instanceof HTMLElement || root instanceof HTMLDialogElement))return {status:'SKIP_ROOT'};
  const imgs=Array.from(root.querySelectorAll('img'));
  const repaired=[];
  for(const img of imgs){
    // A stage must be substantially larger than the image and contain that image directly.
    // Thumbnail parents cannot pass these constraints.
    const parent=img.parentElement;if(!parent)continue;
    if(parent.querySelectorAll('img').length!==1)continue;
    const pr=parent.getBoundingClientRect(),ir=img.getBoundingClientRect();
    if(pr.width<440||pr.height<240||ir.width>155||ir.height>155||ir.width>=pr.width*.25)continue;
    if(!repair){repaired.push({before:[ir.width,ir.height],stage:[pr.width,pr.height],status:'DETECTED'});continue;}
    img.style.setProperty('position','absolute','important');
    img.style.setProperty('inset','0','important');
    img.style.setProperty('display','block','important');
    img.style.setProperty('width','100%','important');
    img.style.setProperty('height','100%','important');
    img.style.setProperty('max-width','none','important');
    img.style.setProperty('max-height','none','important');
    img.style.setProperty('object-fit','contain','important');
    img.style.setProperty('transform','none','important');
    img.dataset.dpTinyImageRepaired='yes';
    if(getComputedStyle(parent).position==='static')parent.style.position='relative';
    const after=img.getBoundingClientRect();
    repaired.push({before:[ir.width,ir.height],after:[after.width,after.height],stage:[pr.width,pr.height],status:after.width>=pr.width*.9&&after.height>=pr.height*.9?'FIXED':'FAILED'});
  }
  return {status:repaired.some(x=>x.status==='FAILED')?'FAIL':repaired.length?'REPAIRED':'NO_TINY_STAGE',repaired};
}
