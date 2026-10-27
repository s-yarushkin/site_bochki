import { normalizeState } from './quote.mjs?v=r93-20261026';
import { CONSENT_VERSION, CONSENT_METHOD } from './lead-consent.mjs?v=r100-20261027';

export const CONTACT_CHANNELS = ['phone', 'max', 'telegram', 'whatsapp'];
export function normalizeSettlement(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0,140);
}
export function callbackAvailable(settings, pageOrigin) {
  return settings?.lead?.enabled === true && settings.lead.allowedOrigins?.includes(pageOrigin) &&
    /^\/(?:[a-z0-9-]+\/)*api\/lead$/.test(settings.lead.endpoint);
}

export function leadAvailable(settings, pageOrigin, pricebookVersion) {
  return callbackAvailable(settings,pageOrigin) && settings.lead.requiredPricebookVersion === pricebookVersion;
}

export function normalizedPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const p = digits.length === 10 && digits.startsWith('9') ? '7' + digits :
    digits.length === 11 && digits.startsWith('8') ? '7' + digits.slice(1) : digits;
  if (!/^79\d{9}$/.test(p) || /^7(\d)\1{9}$/.test(p)) throw new Error('PHONE_INVALID');
  return '+' + p;
}

export function buildLead(catalog, input, fields, requestId) {
  const s = normalizeState(catalog, input);
  if (!/^[a-f0-9-]{16,80}$/i.test(requestId || '')) throw new Error('REQUEST_ID_INVALID');
  const name = String(fields.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0,80);
  if (!CONTACT_CHANNELS.includes(fields.channel)) throw new Error('CHANNEL_INVALID');
  return { requestId, flow: 'quote', name, phone: normalizedPhone(fields.phone), contactChannel: fields.channel,
    consent: true, consentVersion: CONSENT_VERSION, consentMethod: CONSENT_METHOD,
    district: normalizeSettlement(fields.settlement), base: 'unknown', access: 'unknown', journeyComplete: false,
    comment: 'Подбор на сайте Дача Пар. Уточните доставку, основание, исполнение и итог заказа.',
    configuration: { selection:s, modelId:s.model, sizeId:s.size, optionIds:[...s.options], optionQuantities:{...s.quantities}, bundleId:null, pricebookVersion:catalog.version,...(s.finish?{finish:s.finish}:{}),...(s.roof?{roof:s.roof}:{}) } };
}

export async function submitLead(payload, settings, pageOrigin, fetchImpl = fetch) {
  const ready=payload.flow==='callback'?callbackAvailable(settings,pageOrigin):payload.flow==='quote'&&leadAvailable(settings,pageOrigin,payload.configuration?.pricebookVersion);
  if (!ready) throw new Error('LEAD_NOT_CONNECTED');
  const response = await fetchImpl(settings.lead.endpoint, { method:'POST', credentials:'same-origin',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(12000) });
  const result = await response.json().catch(()=>({}));
  if (!response.ok || result.ok !== true || result.delivered !== true || result.analytics?.persisted !== true) {
    const error = new Error(response.status === 429 ? 'RATE_LIMITED' : response.status === 409 ? 'IN_PROGRESS' : 'DELIVERY_NOT_CONFIRMED');
    error.status = response.status; throw error;
  }
  return { confirmed: true, duplicate: result.duplicate === true,
    premiumQualified: result.analytics.premiumQualified === true, detailedQualified: result.analytics.detailedQualified === true, receipt: result };
}

export function buildCallback(fields, requestId) {
  if (!/^[a-f0-9-]{16,80}$/i.test(requestId || '')) throw new Error('REQUEST_ID_INVALID');
  return {requestId,flow:'callback',name:String(fields.name || '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80),
    phone:normalizedPhone(fields.phone),contactChannel:'phone',consent:true,consentVersion:CONSENT_VERSION,consentMethod:CONSENT_METHOD,
    comment:'Заказ обратного звонка. Дача Пар.',journeyComplete:false};
}
