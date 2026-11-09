// Functional request state, not browsing history: no IDs, timestamps or persistence.
export const INTENT_VERSION='request-intent-20261109';
const models=new Set(['kvadro','parus','viking','kvadro-house']);
const kinds=new Set(['model_offer','plan_request','site_capture','header_callback','footer_capture','capture_bar','quiz','calculator','production','foundation','delivery','unknown']);
export function createRequestIntent(env){
 const initial=new URL(env.location.href),chosen=new Map(),channels=new WeakMap();let entry='unknown',form=null;
 const pathModel=initial.pathname.match(/^\/bani\/(kvadro|parus|viking|kvadro-haus)\//)?.[1]?.replace('kvadro-haus','kvadro-house');
 const model=()=>env.document.querySelector?.('[data-model-card][aria-pressed=true]')?.dataset.modelCard??new URL(env.location.href).searchParams.get('bath')??new URL(env.location.href).searchParams.get('model')??chosen.get('model')?.value;
 function select(field,value){if(typeof value==='string')chosen.set(field,{value,model:field==='model'?value:model(),size:new URL(env.location.href).searchParams.get('bathSize')??new URL(env.location.href).searchParams.get('size')});}
 function open(target,reason){
  if(reason==='production')entry='production';else if(reason==='foundation')entry='foundation';else if(reason==='layout_quote')entry='plan_request';
  else if(target?.closest?.('[data-plan-panel],.hh-layout-dialog,.plan-request,[data-plan-info]'))entry='plan_request';
  else if(target?.matches?.('[data-plan-request]')||target?.closest?.('#bath-model,[data-model-card]'))entry='model_offer';
  else if(target?.closest?.('header'))entry='header_callback';else if(target?.closest?.('.resume'))entry='capture_bar';else if(target?.closest?.('footer'))entry='footer_capture';else entry='site_capture';
 }
 function snapshot(payload={}){
  const q=new URL(env.location.href).searchParams,selection={},sources={},cfg=payload.configuration?.selection??payload.configuration??{};
  const values={model:cfg.model??cfg.modelId??q.get('bath')??q.get('model'),size:cfg.size??cfg.sizeId??q.get('bathSize')??q.get('size'),package:cfg.package??cfg.packageId??q.get('package'),plan:cfg.planId??q.get('layout')??q.get('plan'),finish:cfg.finish??payload.configuration?.finish??q.get('finish'),roof:cfg.roof??payload.configuration?.roof??q.get('roof')};
  if(!models.has(values.model)){const slug=env.location.pathname.match(/^\/bani\/(kvadro|parus|viking|kvadro-haus)\//)?.[1];if(slug)values.model=slug==='kvadro-haus'?'kvadro-house':slug;}
  for(const [key,value]of Object.entries(values)){
   if(typeof value!=='string'||value.length>45)continue;
   selection[key]=value;const mark=chosen.get(key),initialValue=key==='model'?initial.searchParams.get('bath')??initial.searchParams.get('model'):key==='size'?initial.searchParams.get('bathSize')??initial.searchParams.get('size'):key==='plan'?initial.searchParams.get('layout')??initial.searchParams.get('plan'):initial.searchParams.get(key);
   const known={model:'[data-model-card]',size:'[data-size-picker]',package:'input[name=package]',plan:'[data-plan-options]',finish:'[name=finish],#body-finish',roof:'[name=roof],#roof-finish'};
   sources[key]=mark?.value===value&&(['model','package','finish','roof'].includes(key)||mark.model===values.model)&&(key!=='plan'||mark.size===values.size)?'explicit':initialValue===value||key==='model'&&pathModel===value?'link':env.document.querySelector?.(known[key])?'default':'unknown';
  }
  let kind=kinds.has(form?.dataset?.leadEntry)?form.dataset.leadEntry:/quiz/i.test(form?.id||'')?'quiz':form?.closest?.('.plan-request,.r96-plan-request')?'plan_request':entry;
  if(payload.purpose==='plan_info')kind='plan_request';if(kind==='unknown'&&payload.flow==='quote')kind='calculator';
  if(kind==='plan_request'&&form?.dataset?.leadPlan){selection.plan=form.dataset.leadPlan;sources.plan='request';}
  if(kind==='quiz')return {version:INTENT_VERSION,entry:kind,pagePath:env.location.pathname,selection:{},sources:{},channelSource:channels.get(form)===payload.contactChannel?'explicit':'default'};
  return {version:INTENT_VERSION,entry:kind,pagePath:env.location.pathname,selection,sources,channelSource:channels.get(form)===payload.contactChannel||kind==='header_callback'&&payload.contactChannel==='phone'?'explicit':'default'};
 }
 function install(){
  env.document.addEventListener('click',event=>{if(event.isTrusted===false)return;const b=event.target.closest?.('button,a,input');if(!b)return;
   if(b.dataset.modelCard)select('model',b.dataset.modelCard);
   else if(models.has(b.dataset.model))select('model',b.dataset.model);
   if(b.dataset.sizePicker)select('size',b.dataset.sizePicker);
   else if(b.dataset.size&&/^(?:[456][05]0|[456]x[456])$/.test(b.dataset.size))select('size',b.dataset.size);
   if(b.closest?.('[data-plan-options]')){const id=b.textContent.trim().toLowerCase();if(/^dp3d-\d{2}$/.test(id))select('plan',id);}
   if(b.matches?.('input[name=package]'))select('package',b.value);
   if(b.matches?.('[data-plan-request],[data-inquiry],[data-contact-callback],[data-production],[data-foundation],[data-resume-inquiry],[data-plan-info],[data-open-lead]'))open(b,b.matches('[data-production]')?'production':b.matches('[data-foundation]')?'foundation':undefined);
  },true);
  env.document.addEventListener('change',event=>{if(event.isTrusted===false)return;const e=event.target;if(e.name==='model'&&models.has(e.value))select('model',e.value);if(['size','bathSize'].includes(e.name))select('size',e.value);if(e.name==='finish'||e.id==='body-finish')select('finish',e.value);if(e.name==='roof'||e.id==='roof-finish')select('roof',e.value);if(e.name==='package'){select('package',e.value);env[Symbol.for('dachapar.analytics')]?.track('dp_package_select',{package:e.value,model:model(),placement:'catalog'});}if(['channel','contactChannel'].includes(e.name)&&e.form)channels.set(e.form,e.value);},true);
  env.document.addEventListener('submit',event=>{if(event.isTrusted!==false)form=event.target;},true);
  env.document.addEventListener('close',()=>{form=null;entry='unknown';},true);
 }
 return {select,open,snapshot,install};
}
export const requestIntent=typeof window==='undefined'?null:(window[Symbol.for('dachapar.request-intent')]??=createRequestIntent(window));
requestIntent?.install();
