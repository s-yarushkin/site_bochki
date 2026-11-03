import {buildCallback, submitLead} from '/lead-client.mjs?v=r100-20261027';
import {attachPhoneMask} from '/phone-mask.mjs';
import {analytics} from '/analytics-core.mjs?v=r117-quiz-goals';

export function openModelRequest({name,size,layout,opener}){
  const dialog = document.createElement('dialog');
  dialog.className = 'hh-bath-dialog';
  dialog.setAttribute('aria-labelledby','hh-request-title');
  dialog.innerHTML = `
    <button class="hh-request-close" type="button" aria-label="Закрыть форму">×</button>
    <p class="hh-request-model"></p>
    <h2 id="hh-request-title">Куда прислать планировки и цены?</h2>
    <p>Пришлём варианты планировок и комплектаций с ценами. Скидка 20 000 ₽ действует при выборе «Делюкса».</p>
    <form>
      <label>Номер телефона <input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (999) 123-45-67" required></label>
      <label>Мессенджер <select name="channel" required><option value="max">MAX</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option></select></label>
      <p class="hh-request-consent">Нажимая кнопку, вы соглашаетесь с <a href="/consent.html" target="_blank" rel="noopener">обработкой персональных данных</a>. <a href="/privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a>.</p>
      <p class="hh-request-error" role="alert" hidden></p>
      <button class="btn" type="submit">Получить планировки и цены</button>
    </form>`;
  const form = dialog.querySelector('form');
  const close = dialog.querySelector('.hh-request-close');
  const submit = form.querySelector('button');
  const error = form.querySelector('[role=alert]');
  const selection = [name,size].filter(Boolean).join(' · ');
  let requestId;
  dialog.querySelector('.hh-request-model').textContent = selection;
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
      payload.comment = 'Источник: карточка модели. Размер для расчёта: '+selection+'. '+(layout ? 'Пример планировки: '+layout.toUpperCase()+'. ' : '')+'Прислать расширенные планировки, комплектации и цены. Скидка 20 000 ₽ при выборе «Делюкса».';
      payload.journeyContext = {purpose:'selection_help',pagePath:location.pathname};
      const attribution = analytics?.attribution?.();
      if(attribution) payload.attribution = attribution;
      const response = await fetch('/data/site-settings.json',{signal:AbortSignal.timeout(10000)});
      if(!response.ok) throw Error('SETTINGS');
      const sent = await submitLead(payload,await response.json(),location.origin);
      analytics?.confirmed?.(sent.receipt,{flow:'callback',requestId,purpose:'selection_help',placement:'catalog'});
      dialog.querySelector('h2').textContent = 'Заявка получена';
      dialog.querySelector('h2 + p').textContent = 'Пришлём подборку в выбранный мессенджер. Если написать не получится, позвоним.';
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
      submit.textContent='Получить планировки и цены';
      submit.disabled=false;
    }
  });
  document.body.append(dialog);
  dialog.showModal();
}
