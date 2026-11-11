export function campaignLeadFields(state,quote,entry,channel){
 const placement=entry==='header'?'кнопка в шапке':'кнопка под ценами';
 const terms=quote.phase==='ended'?'Акция завершена. Запрос актуального предложения.':`Цена по прайсу ${quote.reference} ₽; скидка ЧП ${quote.discountRub} ₽; по акции от ${quote.priceRub} ₽. Договор 11–21.11.2026.`;
 return {
  contactChannel:channel,...(channel==='phone'?{}:{purpose:'quiz_catalog'}),
  comment:`ЧЁРНАЯ ПЯТНИЦА /blackfriday/ — ${placement}. На экране: ${quote.modelName} · ${quote.sizeLabel} · ${quote.packageName}. ${terms} Прислать планировки, комплектации и цены. Окончательная стоимость после согласования.`,
  journeyContext:{purpose:'selection_help',pagePath:'/blackfriday/'}
 };
}
