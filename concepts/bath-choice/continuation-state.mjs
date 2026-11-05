import {buildCallback} from '../../web/lead-client.mjs';
import {HERO_MODELS} from '../home-hero/catalog.mjs';
import {normalizeChoice,choicePrice,choiceSizeLabel} from './state.mjs';
import {PACKAGE_NAMES} from './packages.mjs';

export function homeSelectionText(book,state){
 const price=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(choicePrice(book,state));
 return HERO_MODELS[state.model].name+' · '+choiceSizeLabel(book,state.model,state.size)+' · '+price+' · в комплектации «'+PACKAGE_NAMES[state.package]+'»';
}

export function homeInquiryPayload(book,plans,state,values,requestId){
 const selected=normalizeChoice(book,plans,state);
 if(['model','size','package','layout'].some(key=>selected[key]!==state[key]))throw Error('SELECTION_MISMATCH');
 if(!['phone','max','telegram','whatsapp'].includes(values.channel))throw Error('INVALID_CHANNEL');
 const payload=buildCallback(values,requestId);
 payload.purpose='quiz_catalog';payload.contactChannel=values.channel;
 const selection=HERO_MODELS[state.model].name+' · '+choiceSizeLabel(book,state.model,state.size)+' · в комплектации «'+PACKAGE_NAMES[state.package]+'»';
 const parts=['Источник: главная страница. Выбор: '+selection+'.',state.layout?'Планировка: '+state.layout.toUpperCase()+'.':'',values.settlement?'Участок: '+String(values.settlement).trim().slice(0,140)+'.':'',String(values.comment||'').trim().slice(0,250)];
 payload.comment=parts.filter(Boolean).join(' ').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,500);
 payload.journeyContext={purpose:'selection_help',pagePath:'/'};
 return payload;
}
