import {CAMPAIGN} from './blackfriday-data.mjs';
export {CAMPAIGN};
let clockOffset=0;
export function syncCampaignClock(response){
 const date=Date.parse(response?.headers?.get?.('Date')??'');
 if(Number.isFinite(date))clockOffset=date-Date.now();
}
export const campaignNow=()=>Date.now()+clockOffset;
export function campaignPhase(now=campaignNow()){
 return now<Date.parse(CAMPAIGN.start)?'upcoming':now<Date.parse(CAMPAIGN.end)?'active':'ended';
}
export function campaignQuote(model,size,pack='comfort',{now=campaignNow(),previewUpcoming=false}={}){
 const row=CAMPAIGN.rows.find(r=>r.model===model&&r.size===size&&r.package===pack);
 if(!row)throw Error('UNKNOWN_CAMPAIGN_SELECTION');
 const phase=campaignPhase(now),discounted=phase==='active'||phase==='upcoming'&&previewUpcoming;
 return {...row,phase,discountRub:discounted?row.discount:0,priceRub:discounted?row.reference-row.discount:row.reference};
}
export function campaignChoiceQuote(book,state,options={}){
 const row=book.r85.models[state.model].sizes[state.size],source=state.package==='deluxe'?row.deluxe.priceRub:row.priceRub;
 const quote=campaignQuote(state.model,state.size,state.package,options);
 // A later pricebook update must not silently inherit an outdated promotion.
 return source===quote.source?quote:null;
}
export const campaignCondition='Скидка действует при заключении договора с 11 по 21 ноября 2026 включительно, по московскому времени.';
