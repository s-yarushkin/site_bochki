// ADS-01: server-owned conversion qualification. Never trust client quote totals.
export const PREMIUM_MIN_RUB = 750000;
const cities = Object.freeze({ 'ногинск':'noginsk','королев':'korolev','ивантеевка':'ivanteevka' });
export function premiumCity(value) {
  if(typeof value !== 'string' || value.length > 140) return null;
  let parts=value.normalize('NFKC').toLowerCase().replaceAll('ё','е').trim().split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  if(parts.length<1 || parts.length>3)return null;
  const region=/^(?:рф|россия|московская\s+(?:область|обл\.? )|московская\s+обл\.?|мо)$/;
  let selected=null;
  for(const part of parts) {
    if(region.test(part))continue;
    const candidate=part.replace(/^(?:город\s+|г\.?\s*)/,'').trim();
    if(!Object.hasOwn(cities,candidate) || selected)return null;
    selected=cities[candidate];
  }
  return selected;
}
export function classifyConfirmedLead(lead) {
  if(!lead || lead.flow!=='quote' || !lead.estimate)return {premiumQualified:false,detailedQualified:false};
  const sum=lead.estimate.total;
  const priced=Number.isSafeInteger(sum) && sum>=0;
  const premiumQualified=priced && sum>=PREMIUM_MIN_RUB && premiumCity(lead.district)!==null;
  const options=Array.isArray(lead.estimate.options)?lead.estimate.options:[];
  const detailedQualified=lead.journeyComplete===true && typeof lead.district==='string' && lead.district.trim().length>=2 && options.filter(o=>Number.isSafeInteger(o.price)&&o.price>0).length>=2;
  return {premiumQualified,detailedQualified};
}
