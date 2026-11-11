import {journeyFormOpened} from '/journey-tracker.mjs?v=quiz-overview-20261106';
import {buildCallback, submitLead} from '/lead-client.mjs?v=quiz-overview-20261106';
import {attachPhoneMask} from '/phone-mask.mjs';
import {analytics} from '/analytics-core.mjs?v=quiz-overview-20261106';

export function openModelRequest({name,size,layout,packageName,reason,opener,campaignOffer}){
  journeyFormOpened(opener,reason??'quote');
  const dialog = document.createElement('dialog');
  dialog.className = 'hh-bath-dialog';
  dialog.setAttribute('aria-labelledby','hh-request-title');
  dialog.innerHTML = `
    <button class="hh-request-close" type="button" aria-label="Закрыть форму">×</button>
    <p class="hh-request-model"></p>
    <h2 id="hh-request-title">Куда прислать планировки и цены?</h2>
    <p>Пришлём варианты планировок и комплектаций с ценами. В комплектации «Делюкс» действует скидка 20 000 ₽.</p>
    <form>
      <label>Номер телефона <input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (999) 123-45-67" required></label>
      <label>Мессенджер <select name="channel" required><option value="max">MAX</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option></select></label>
      <p class="hh-request-consent">Нажимая кнопку, вы соглашаетесь с <a href="/consent.html" target="_blank" rel="noopener">обработкой персональных данных</a>. <a href="/privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a>.</p>
      <p class="hh-request-error" role="alert" hidden></p>
      <button class="btn" type="submit">Получить планировки и цены</button>
    </form>`;
  const form = dialog.querySelector('form');
  form.dataset.leadEntry=reason==='layout_quote'?'plan_request':reason==='production'?'production':reason==='foundation'?'foundation':'model_offer';
  if(reason==='layout_quote'&&layout)form.dataset.leadPlan=layout;
  const close = dialog.querySelector('.hh-request-close');
  const submit = form.querySelector('button');
  const error = form.querySelector('[role=alert]');
  const selection = [name,size,packageName?'в комплектации «'+packageName+'»':null].filter(Boolean).join(' · ');
  const actions={
    layout_quote:{title:'Рассчитаем выбранную планировку',intro:'Подготовим предложение с выбранной комплектацией, доставкой и установкой на вашем участке. Пришлём его в удобный мессенджер.',button:'Запросить цену планировки',success:'Подготовим расчёт вашей планировки и свяжемся с вами в выбранном мессенджере.'},
    quote:{title:'Куда прислать расчёт?',intro:'Подготовим предложение с выбранной комплектацией, доставкой и установкой на вашем участке.',button:'Получить расчёт',success:'Подготовим расчёт и свяжемся с вами в выбранном мессенджере.'},
    production:{title:'Покажем производство онлайн',intro:'Подберём удобное время для видеозвонка, покажем бани в работе и ответим на ваши вопросы.',button:'Договориться о показе',success:'Свяжемся с вами в выбранном мессенджере и договоримся о времени показа.'},
    foundation:{title:'Поможем с вашим участком',intro:'Бесплатно проконсультируем по основанию, обсудим проезд и способ установки вашей бани.',button:'Получить консультацию',success:'Свяжемся с вами в выбранном мессенджере и обсудим ваш участок.'}
  };
  const action=actions[reason];
  let requestId;
  dialog.querySelector('.hh-request-model').textContent = selection;
  if(action){
    dialog.querySelector('h2').textContent=action.title;
    dialog.querySelector('h2 + p').textContent=action.intro;
    submit.textContent=action.button;
  }
  if(campaignOffer?.phase==='active'){if(!action)dialog.querySelector('h2 + p').textContent='Пришлём варианты планировок и комплектаций с ценами.';dialog.querySelector('h2 + p').textContent+=' Чёрная пятница: скидка '+new Intl.NumberFormat('ru-RU').format(campaignOffer.discountRub)+' ₽ при заключении договора 11–21 ноября 2026.';}
  attachPhoneMask(form.elements.phone);
  form.addEventListener('input',()=>{requestId=undefined;});
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
    dialog.remove();
    if(opener.getClientRects().length) opener.focus({preventScroll:true});
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submit.disabled) return;
    error.hidden=true;
    submit.disabled=true;
    submit.textContent='Отправляем…';
    try{
      const payload = buildCallback({phone:form.elements.phone.value},requestId ??= crypto.randomUUID());
      payload.purpose = 'quiz_catalog';
      payload.contactChannel = form.elements.channel.value;
      payload.comment = 'Источник: карточка модели. На экране показано: '+selection+'. '+(layout ? 'Пример планировки: '+layout.toUpperCase()+'. ' : '')+'Прислать расширенные планировки, комплектации и цены. '+(campaignOffer?.phase==='active'?'Чёрная пятница: цена по прайсу '+campaignOffer.reference+' ₽; скидка '+campaignOffer.discountRub+' ₽; цена модели от '+campaignOffer.priceRub+' ₽; договор 11–21.11.2026.':'Скидка 20 000 ₽ при выборе «Делюкса».');
      if(reason==='production')payload.comment+=' Пожелание: онлайн-показ производства.';
      if(reason==='foundation')payload.comment+=' Пожелание: консультация по основанию и установке.';
      if(reason==='quote')payload.comment+=' Пожелание: расчёт доставки и установки.';
      if(reason==='layout_quote')payload.comment+=' Пожелание: точный расчёт выбранной планировки и комплектации, доставки и установки.';
      payload.comment=payload.comment.slice(0,500);
      payload.journeyContext = {purpose:'selection_help',pagePath:location.pathname};
      const attribution = analytics?.attribution?.();
      if(attribution) payload.attribution = attribution;
      const response = await fetch('/data/site-settings.json',{signal:AbortSignal.timeout(10000)});
      if(!response.ok) throw Error('SETTINGS');
      const sent = await submitLead(payload,await response.json(),location.origin);
      analytics?.confirmed?.(sent.receipt,{flow:'callback',requestId,purpose:'selection_help',placement:'catalog'});
      dialog.querySelector('h2').textContent = 'Заявка получена';
      dialog.querySelector('h2 + p').textContent = action?.success || 'Пришлём подборку в выбранный мессенджер. Если написать не получится, позвоним.';
      form.replaceChildren(submit);
      submit.type='button';
      submit.textContent='Вернуться к модели';
      submit.addEventListener('click',()=>dialog.close());
      submit.disabled=false;
      if(dialog.open) submit.focus();
    }catch(cause){
      error.textContent = cause.message === 'PHONE_INVALID' ? 'Проверьте номер мобильного телефона.' :
        'Заявка пока не подтверждена. Попробуйте отправить ещё раз.';
      error.hidden=false;
      submit.textContent=action?.button || 'Получить планировки и цены';
      submit.disabled=false;
    }
  });
  document.body.append(dialog);
  dialog.showModal();
}
