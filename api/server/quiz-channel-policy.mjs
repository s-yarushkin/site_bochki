/** Allowed channels only for a deliberate catalog request after the bath-selection quiz. */
export const QUIZ_CONTACT_CHANNELS=Object.freeze(['max','whatsapp','telegram']);
export function validQuizCatalogRequest(value,contactChannel){
  return value?.purpose==='quiz_catalog' &&
    value.flow==='callback' &&
    QUIZ_CONTACT_CHANNELS.includes(contactChannel) &&
    value.configuration===undefined &&
    value.planRequest===undefined;
}
