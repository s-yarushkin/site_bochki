// Reuse the site's callback contract. MAX delivery remains owned by /api/lead.
import {buildCallback,buildLead, normalizeSettlement} from '../../web/lead-client.mjs';
import {modelOffer} from './catalog.mjs';

export function campaignInquiry(fields, requestId,context=null) {
  const offer=context?modelOffer(context.book,context.selection):null;
  const payload = offer?buildLead(context.book,offer.selection,{...fields,channel:'phone'},requestId):buildCallback(fields,requestId);
  const settlement = normalizeSettlement(fields.settlement);
  const wish = String(fields.comment || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0,300);
  payload.journeyContext = {purpose:offer?'quote':'selection_help',pagePath:'/novyy-god/'};
  if (settlement) payload.journeyContext.district = settlement;
  payload.comment = [
    'Новый год 2027. Пришлите варианты планировок и комплектаций. Уточнить срок к празднику.',
    offer?`${offer.name} · ${offer.sizeLabel} · Комфорт.`:'',
    settlement ? 'Населённый пункт: '+settlement.slice(0,80)+'.' : '',
    wish
  ].filter(Boolean).join(' ').slice(0,500);
  return payload;
}

// Keep an idempotency key for unchanged retries; edited requests get a new key.
export function createRequestIdentity(uuid = () => crypto.randomUUID()) {
  let key = '', requestId;
  return {assign(payload) {
    const {requestId:ignored,...body} = payload;
    const next = JSON.stringify(body);
    if(next !== key) {key = next;requestId = uuid();}
    return {...payload,requestId};
  }};
}
