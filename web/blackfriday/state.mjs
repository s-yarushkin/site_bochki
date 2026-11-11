import {CAMPAIGN,campaignQuote} from '../campaigns/blackfriday.mjs';
export const models=['kvadro','parus','viking','kvadro-house'];
export function sizes(model){return [...new Map(CAMPAIGN.rows.filter(r=>r.model===model).map(r=>[r.size,{id:r.size,label:r.sizeLabel}])).values()];}
export function normalize(input={}){
 const model=models.includes(input.model)?input.model:'parus',options=sizes(model);
 return {model,size:options.some(o=>o.id===input.size)?input.size:options[0].id,package:input.package==='deluxe'?'deluxe':'comfort'};
}
export const quote=(state,pack=state.package)=>campaignQuote(state.model,state.size,pack,{previewUpcoming:true});
export const prices=state=>({comfort:quote(state,'comfort'),deluxe:quote(state,'deluxe')});
