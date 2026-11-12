import {buildCallback} from '/lead-client.mjs?v=quiz-overview-20261106';
export function homeInquiryPayload(values,requestId){
 if(!['phone','max','telegram','whatsapp'].includes(values.channel))throw Error('INVALID_CHANNEL');
 const payload=buildCallback(values,requestId);
 payload.contactChannel=values.channel;
 if(values.channel!=='phone')payload.purpose='quiz_catalog';
 const settlement=String(values.settlement||'').trim().slice(0,140);
 const parts=['Источник: главная страница.',settlement?'Участок: '+settlement+'.':'',String(values.comment||'').trim().slice(0,250)];
 payload.comment=parts.filter(Boolean).join(' ').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,500);
 payload.journeyContext={purpose:'selection_help',pagePath:'/'};
 return payload;
}
