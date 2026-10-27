import {normalizeState} from './quote.mjs?v=r93-20261026';
export const CHOICE_KEY='dachapar-choice-r85-v1';
export const REFERENCE_KEY='dachapar-photo-reference-v1';
const models=new Set(['kvadro','viking','parus','kvadro-house']);
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(value);
export function cleanReference(value){if(!value||!models.has(value.model)||!id(value.objectId)||!id(value.photoId))return null;return {model:value.model,objectId:value.objectId,photoId:value.photoId}}
export function readJSON(storage,key){try{return JSON.parse(storage?.getItem(key)||'null')}catch{return null}}
export function writeJSON(storage,key,value){try{storage?.setItem(key,JSON.stringify(value));return true}catch{return false}}
export function selectPlan(catalog,plan,mirror=false,previous={}){
 const verified=catalog.r85.plans.find(p=>p.id===plan?.id);if(!verified)throw Error('UNKNOWN_PLAN');
 const same=previous?.model===verified.model&&String(previous?.size)===verified.size;
 return normalizeState(catalog,{...(same?previous:{}),model:verified.model,size:verified.size,planId:verified.id,mirror:mirror===true});
}
export function referenceFromURL(params){try{const raw=params.get('reference');return raw&&raw.length<=500?cleanReference(JSON.parse(raw)):null}catch{return null}}
export function variantURL(origin,state,reference=null){const u=new URL('/',origin);u.hash='configure';u.searchParams.set('model',state.model);u.searchParams.set('size',state.size);u.searchParams.set('choice',JSON.stringify(state));const ref=cleanReference(reference);if(ref&&(!state.model||ref.model===state.model))u.searchParams.set('reference',JSON.stringify(ref));return u.href}
export function planCalculationURL(origin,plan,mirror=false){const u=new URL('/',origin);u.hash='configure';u.searchParams.set('model',plan.model);u.searchParams.set('size',plan.size);u.searchParams.set('plan',plan.id);if(mirror)u.searchParams.set('planMirror','1');return u.href}
export function selectionChange(catalog,previous,patch){const next=normalizeState(catalog,{...previous,...patch});return {state:next,planRemoved:Boolean(previous?.planId&&!next.planId),reason:previous?.planId&&!next.planId?'Выберите подходящую планировку для нового размера.':''}}
