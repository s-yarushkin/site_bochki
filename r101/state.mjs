import {buildLead,buildCallback} from '../lead-client.mjs';
import {calculate} from '../quote.mjs';
export const withdrawnPlans=new Set(['p9','p11']);
export function comfortSelection(book,input={}){
 if(!Object.hasOwn(book.r85.models,input.model||''))return null;
 const model=input.model,sizes=book.r85.models[model].sizes;
 const size=Object.hasOwn(sizes,String(input.size))?String(input.size):Object.keys(sizes)[0];
 // The public R101 selection cannot restore Deluxe, extras, mirror or a plan from historical state.
 return {model,size,package:'comfort',options:[],quantities:{},planId:null,mirror:false};
}
export function comfortPrice(book,state){return state?calculate(book,comfortSelection(book,state)).total:null;}
export function selectionLink(origin,state){
 const slug=state.model==='kvadro-house'?'kvadro-haus':state.model;
 const url=new URL('/bani/'+slug+'/',origin);url.searchParams.set('size',state.size);return url.href;
}
export function safeReference(photos,id,model){
 const p=photos.find(p=>p.photoId===id&&p.model===model);
 return p?{model:p.model,objectId:p.objectId,photoId:p.photoId}:null;
}
export function inquiryPayload(book,state,fields,context,id){
 const chosen=comfortSelection(book,state||{});
 const payload=chosen?buildLead(book,chosen,fields,id):buildCallback(fields,id);
 const purposes=['delivery','selection_help','photo','plan','quote'];
 payload.journeyContext={purpose:purposes.includes(context.purpose)?context.purpose:'selection_help',pagePath:context.pagePath||'/'};
 if(fields.settlement)payload.journeyContext.district=fields.settlement.trim().slice(0,140);
 if(context.reference&&chosen&&context.reference.model===chosen.model)payload.journeyContext.reference=context.reference;
 const plan=context.plan&&!withdrawnPlans.has(context.plan.id)&&chosen&&context.plan.model===chosen.model&&context.plan.size===chosen.size?context.plan:null;
 const info=[context.purpose==='delivery'?'Бесплатная консультация: доставка и размещение бани.':chosen?'Комфорт. Обсудить пожелания и доставку.':'Помощь с выбором бани.',plan?'Схема как пожелание: '+plan.id+'.':'',fields.settlement?'Населённый пункт: '+fields.settlement.trim().slice(0,80)+'.':'',String(fields.comment||'').trim().slice(0,300)];
 payload.comment=info.filter(Boolean).join(' ').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,500);
 return payload;
}


export function resumeVisible({ready=false,anchorBottom=null,threshold=100,dismissed=false,modalOpen=false}={}){
 return ready&&!dismissed&&!modalOpen&&Number.isFinite(anchorBottom)&&anchorBottom<=threshold;
}
