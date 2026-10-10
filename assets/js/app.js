import {PRICEBOOK} from '../../data/pricebook.js';
import {calculateQuote,formatMoney,getModel,getOption} from './quote-engine.js';
import {syncMedia} from './media-v5.js';
import {initAtmosphere,syncAtmosphereText} from './weather-v6.js';

const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const escaped=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stepNames=['Выберите модель','Выберите размер','Внешний вид','Парная и тепло','Удобства','Ваш участок','Ваша комплектация'];
const state={step:0,modelId:'kvadro-house',sizeId:'500',optionIds:[],bundleId:null,finish:'natural',view:'outside',region:'',base:'unknown',access:'unknown'};
let formFlow='quote';
let formQuote=null;
let submitted=false;
let formRequestId=null;
const money=formatMoney;
const bundle=PRICEBOOK.bundle;

function choice({title,detail='',selected=false,attributes='',price='',icon='⌂'}){
  return `<button type="button" class="choice ${selected?'selected':''}" ${attributes} aria-pressed="${selected}"><span class="choice-icon" aria-hidden="true">${icon}</span><strong>${escaped(title)}</strong>${detail?`<small>${escaped(detail)}</small>`:''}${price?`<small>${escaped(price)}</small>`:''}</button>`;
}
function renderCatalog(){
  $('#catalogGrid').innerHTML=PRICEBOOK.models.map(model=>{
    const low=Math.min(...Object.values(model.sizes));
    return `<article class="product-card" data-model="${model.id}"><div class="product-media media-frame" data-slot="${model.slot}"><span class="photo-placeholder-symbol" aria-hidden="true">⌂</span><span class="slot-name">Фото модели «${escaped(model.name)}»</span></div><div class="product-body"><h3>${escaped(model.name)}</h3><p>${escaped(model.subtitle)}</p><div class="product-meta"><div class="product-price"><small>демо от</small>${money(low)}</div><div class="product-sizes">${Object.keys(model.sizes).map(x=>`${x[0]} м`).join(' / ')}</div></div><button class="btn btn-dark" type="button" data-catalog-select="${model.id}">Выбрать модель →</button></div></article>`;
  }).join('');
  syncMedia();
  $$('[data-catalog-select]').forEach(button=>button.addEventListener('click',()=>{
    const m=getModel(button.dataset.catalogSelect);state.modelId=m.id;state.sizeId=Object.keys(m.sizes)[0];state.bundleId=null;state.optionIds=[];state.step=1;
    renderBuilder();$('#builder').scrollIntoView({behavior:'smooth'});
  }));
  $$('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{
    const value=btn.dataset.filter;
    $$('[data-filter]').forEach(x=>{const active=x===btn;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
    $$('.product-card').forEach(card=>card.hidden=value!=='all'&&card.dataset.model!==value);
  }));
}
function renderBundle(){
  const options=bundle.optionIds.map(id=>getOption(id));
  $('#bundleOptions').innerHTML=options.map(o=>`<div class="bundle-item">${escaped(o.name)}</div>`).join('');
  const quote=calculateQuote({modelId:bundle.modelId,sizeId:bundle.sizeId,optionIds:bundle.optionIds,bundleId:bundle.id});
  $('#bundleOld').textContent=money(quote.beforeDiscount);
  $('#bundleNew').textContent=money(quote.total);
  $('#bundleSaving').textContent=`Выгода −${money(quote.discount)} · демо`;
  $$('[data-bundle]').forEach(btn=>btn.addEventListener('click',()=>{
    state.modelId=bundle.modelId;state.sizeId=bundle.sizeId;state.optionIds=[...bundle.optionIds];state.bundleId=bundle.id;state.step=btn.dataset.bundle==='summary'?6:3;
    renderBuilder();$('#builder').scrollIntoView({behavior:'smooth'});
  }));
}
function quote(){return calculateQuote({modelId:state.modelId,sizeId:state.sizeId,optionIds:state.optionIds,bundleId:state.bundleId});}
function priceLine(label,value,css=''){return `<div class="quote-row ${css}"><span>${escaped(label)}</span><strong>${escaped(value)}</strong></div>`;}
function renderSummary(){
  const q=quote(),model=getModel(state.modelId);
  const length=Number(state.sizeId[0]);
  $('#previewModelName').textContent=`${model.name} · ${length} м`;
  $('#quoteTotal').textContent=money(q.total);
  const chosen=q.options.length?`${q.options.length} дополнительных опций${q.bundleApplied?' · комплект Комфорт+':''}`:'Пока без дополнительных опций';
  $('#previewOptionsText').textContent=chosen;
  $('#quoteBreakdown').innerHTML=priceLine('Готовая баня',money(q.basePrice))+priceLine(`Дополнения (${q.options.length})`,money(q.optionsSubtotal))+(q.discount?priceLine(q.bundleApplied?'Выгода комплекта':'Скидка на допы',`−${money(q.discount)}`,'discount'):'');
  $('#quoteDetails').innerHTML=q.options.length?q.options.map(o=>`<div class="breakdown-line"><span>${escaped(o.name)}</span><b>${money(o.price)}</b></div>`).join(''):'<p class="tiny muted">Дополнительные опции пока не выбраны.</p>';
  const slot=state.view==='outside'?model.slot:state.view==='inside'?'product-interior':'product-front';
  $('#previewImage').dataset.slot=slot;
  $('#previewImage').setAttribute('aria-label',state.view==='outside'
    ?`Фотография семейства «${model.name}». Иллюстрация формы, размеры и отделка конкретного заказа могут отличаться.`
    :state.view==='inside'?'Пример интерьера одной из бань. Не визуализация выбранной комплектации.':'Схема выбранной модели будет уточнена.');
  $('#previewCaption').textContent=state.view==='outside'?`Фото модели «${model.name}»`:state.view==='inside'?'Пример интерьера, комплектация может отличаться':'Размерная схема уточняется для заказа';
  syncMedia();
  $$('[data-view]').forEach(btn=>{const selected=btn.dataset.view===state.view;btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',String(selected));});
}
function optionCard(o){const selected=state.optionIds.includes(o.id);return `<button type="button" class="option-row ${selected?'selected':''}" data-option="${o.id}" aria-pressed="${selected}"><span class="option-check" aria-hidden="true">${selected?'✓':''}</span><span class="option-main"><strong>${escaped(o.name)}</strong><small>${escaped(o.benefit)} · совместимость уточним</small></span><span class="option-cost">+${money(o.price)}</span></button>`;}
function renderOptions(category){const chosen=PRICEBOOK.options.filter(o=>o.category===category);return `<div class="options-grid">${chosen.map(optionCard).join('')}</div><p class="builder-insight">Все цены демонстрационные. Техническую возможность установки опций подтвердит производитель.</p>`;}
function renderQuoteTable(){const q=quote();return `<div class="summary-table"><div class="quote-row"><b>${escaped(q.modelName)} · ${state.sizeId[0]} м</b><b>${money(q.basePrice)}</b></div>${q.options.map(o=>priceLine(o.name,money(o.price))).join('')}${q.discount?priceLine(q.bundleApplied?'Демовыгода готового комплекта':`Скидка ${q.discountRate}% на допы`,`−${money(q.discount)}`,'discount'):''}<div class="quote-row"><b>Предварительно</b><b>${money(q.total)}</b></div></div><p class="builder-insight">Не включены неподтверждённые доставка, разгрузка, основание и подключения. Это демосмета, а не окончательная цена.</p><button type="button" class="btn btn-accent btn-full" data-flow="quote">Получить расчёт для моего участка ↗</button>`;}
function renderStepContent(){const model=getModel(state.modelId),step=state.step;let body='';
  if(step===0){body=`<h3 class="builder-title">Какая баня станет вашей?</h3><p class="builder-help">Выберите модель. Потом подберём размер и дополнения.</p><div class="choice-grid">${PRICEBOOK.models.map(m=>choice({title:m.name,detail:m.subtitle,selected:state.modelId===m.id,attributes:`data-choose-model="${m.id}"`,icon:'⌂'})).join('')}</div>`;}
  if(step===1){body=`<h3 class="builder-title">Какой размер нужен?</h3><p class="builder-help">Доступные размеры в демонстрационном каталоге ${escaped(model.name)}.</p><div class="size-choices">${Object.keys(model.sizes).map(sz=>choice({title:sz[0]+' м',detail:sz+' · демо',price:money(model.sizes[sz]),selected:state.sizeId===sz,attributes:`data-choose-size="${sz}"`,icon:'↔'})).join('')}</div>`;}
  if(step===2){const finishes=[['natural','Натуральное дерево','#cda86c'],['walnut','Тёплый орех','#796246'],['graphite','Графит','#525754']];body=`<h3 class="builder-title">Каким будет внешний вид?</h3><p class="builder-help">Выберите настроение оформления. Доступные цвета и доплату подтвердим перед заказом.</p><div class="color-choices">${finishes.map(([id,title,color])=>`<button type="button" class="color-choice ${state.finish===id?'selected':''}" data-finish="${id}" aria-pressed="${state.finish===id}"><span class="color-swatch" style="background:${color}"></span>${title}</button>`).join('')}</div><div class="color-hint">Цвет — визуальное пожелание. Он не меняет расчёт, пока у нас нет утверждённого прайса отделки.</div>`;}
  if(step===3){body=`<h3 class="builder-title">Тепло начинается с деталей</h3><p class="builder-help">Подсветка полка, топка, отделка: выберите то, что сделает вашу парную особенной.</p>${renderOptions('steam')}`;}
  if(step===4){body=`<h3 class="builder-title">Добавим немного удобства</h3><p class="builder-help">Вода, крыльцо, окна и дополнительные мелочи для долгожданного отдыха.</p>${renderOptions('comfort')}`;}
  if(step===5){body=`<h3 class="builder-title">Расскажите об участке</h3><p class="builder-help">Это поможет затем уточнить доставку и установку. В демо данные остаются в браузере.</p><div class="site-fields"><label>Где ваша дача? <input id="regionInput" maxlength="140" placeholder="Город / район" value="${escaped(state.region)}"></label><label>Основание под баню<select id="baseSelect"><option value="unknown">Пока не знаю</option><option value="ready">Подготовлено</option><option value="advice">Нужна консультация</option></select></label><label>Подъезд транспорта<select id="accessSelect"><option value="unknown">Нужно уточнить</option><option value="yes">Есть подъезд</option><option value="advice">Нужна консультация</option></select></label></div><p class="builder-insight">Доставка и основание сейчас не включены в стоимость. Менеджер уточнит детали позже.</p>`;}
  if(step===6){body=`<h3 class="builder-title">Вы уже собрали свою баню</h3><p class="builder-help">Вот ваш предварительный комплект. Если хотите, вернитесь назад и измените детали.</p>${renderQuoteTable()}`;}
  $('#builderStepContent').innerHTML=body;
  if(step===5){$('#baseSelect').value=state.base;$('#accessSelect').value=state.access;$('#regionInput').addEventListener('input',e=>state.region=e.target.value);$('#baseSelect').addEventListener('change',e=>state.base=e.target.value);$('#accessSelect').addEventListener('change',e=>state.access=e.target.value);}
  $$('[data-choose-model]').forEach(btn=>btn.addEventListener('click',()=>{const old=state.modelId;state.modelId=btn.dataset.chooseModel;state.sizeId=Object.keys(getModel(state.modelId).sizes)[0];if(old!==state.modelId){state.optionIds=[];state.bundleId=null;}renderBuilder();}));
  $$('[data-choose-size]').forEach(btn=>btn.addEventListener('click',()=>{if(state.sizeId!==btn.dataset.chooseSize){state.bundleId=null;state.sizeId=btn.dataset.chooseSize;}renderBuilder();}));
  $$('[data-finish]').forEach(btn=>btn.addEventListener('click',()=>{state.finish=btn.dataset.finish;renderBuilder();}));
  $$('[data-option]').forEach(btn=>btn.addEventListener('click',()=>toggleOption(btn.dataset.option)));
  // Form entry points are handled by one delegated listener in initForms().
}
function toggleOption(id){const option=getOption(id);if(!option)return;
  if(state.optionIds.includes(id)){state.optionIds=state.optionIds.filter(x=>x!==id);}
  else {if(option.mutex)state.optionIds=state.optionIds.filter(x=>getOption(x).mutex!==option.mutex);state.optionIds.push(id);}
  // Bundle is intentionally retained as an eligibility intent; removing a required option
  // suspends it until re-added; no stacking with progressive discount.
  renderBuilder();
}
function renderBuilder(){if(!Object.hasOwn(getModel(state.modelId).sizes,state.sizeId)){state.sizeId=Object.keys(getModel(state.modelId).sizes)[0];state.bundleId=null;}
  $('#builderStepLabel').textContent=`ШАГ ${state.step+1} ИЗ 7`;$('#builderStepName').textContent=stepNames[state.step];$('#builderProgress').style.width=`${((state.step+1)/7)*100}%`;
  renderStepContent();renderSummary();$('#builderBack').disabled=state.step===0;$('#builderBack').style.visibility=state.step===0?'hidden':'visible';$('#builderNext').textContent=state.step===6?'Начать заново ↺':'Далее →';
}
function initBuilder(){renderBuilder();$('#builderBack').addEventListener('click',()=>{if(state.step>0){state.step--;renderBuilder();}});$('#builderNext').addEventListener('click',()=>{
  if(state.step===6){state.step=0;state.optionIds=[];state.bundleId=null;state.finish='natural';state.region='';state.base='unknown';state.access='unknown';}
  else state.step++;renderBuilder();
 });$('#quoteDetailsToggle').addEventListener('click',()=>{const node=$('#quoteDetails');node.hidden=!node.hidden;$('#quoteDetailsToggle').setAttribute('aria-expanded',String(!node.hidden));});
 $$('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{state.view=btn.dataset.view;renderSummary();}));}
function setWeather(weather){
  if(weather!=='sun'&&weather!=='rain')return;
  const rain=weather==='rain';
  // Weather is presentation only; never mutate configuration, quote or form state.
  document.documentElement.dataset.theme=weather;
  const meta=$('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',rain?'#0c192a':'#f7faf9');
  $$('[data-weather]').forEach(button=>{
    const active=button.dataset.weather===weather;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  $('#heroMedia').dataset.slot=rain?'hero-rain-desktop':'hero-sun-desktop';
  $('#heroPhotoId').textContent=rain?'ВИЗУАЛИЗАЦИЯ · ДОЖДЬ':'РЕАЛЬНЫЙ ОБЪЕКТ';
  $('#heroPhotoCaption').textContent=rain
    ?'Дождливая атмосфера · обработка исходной фотографии'
    :'Готовая баня на настоящем участке';
  $('#heroMedia').setAttribute('aria-label',rain
    ?'Иллюстрация бани в дождливый вечер на основе реальной фотографии'
    :'Квадро Хаус: реальная фотография установленной бани на участке');
  $('#heroTitle').innerHTML=rain
    ?'За окном дождь.<br>А у вас —<br><em>своя баня.</em>'
    :'Приехали на дачу.<br>Растопили баню.<br><em>Отдых начался.</em>';
  $('#heroLead').textContent=rain
    ?'Пусть за окном дождь. Своя баня, тёплый вечер и близкие рядом. Изготовим заранее и доставим готовым изделием — условия установки согласуем под ваш участок.'
    :'Пятничный вечер, близкие рядом, любимая дача. Баню изготовят заранее и доставят готовым изделием — без затяжной стройки на участке.';
  syncMedia();
  syncAtmosphereText(weather);
}
function initWeather(){
  $$('[data-weather]').forEach(button=>{
    button.addEventListener('click',()=>setWeather(button.dataset.weather));
  });
  setWeather('sun');
}
function initMobileMenu(){const toggle=$('#menuToggle');toggle.addEventListener('click',()=>{const opened=$('#primaryNav').classList.toggle('open');toggle.setAttribute('aria-expanded',String(opened));toggle.setAttribute('aria-label',opened?'Закрыть меню':'Открыть меню');});$$('#primaryNav a').forEach(link=>link.addEventListener('click',()=>{$('#primaryNav').classList.remove('open');toggle.setAttribute('aria-expanded','false');}));}
function normalizeRussianMobile(value){
  let digits=String(value).replace(/\D/g,'');
  if(digits.startsWith('8'))digits='7'+digits.slice(1);
  if(digits.startsWith('9'))digits='7'+digits;
  return digits;
}
function isRussianMobile(value){
  const digits=normalizeRussianMobile(value);
  return /^79\d{9}$/.test(digits)&&!/^7(\d)\1{9}$/.test(digits);
}
function formatRussianMobile(value){
  const digits=normalizeRussianMobile(value);
  if(!digits)return '';
  if(!digits.startsWith('7'))return value;
  const d=digits.slice(1,11);
  return '+7'+(d.length?' ('+d.slice(0,3):'')+
    (d.length>=3?') '+d.slice(3,6):'')+
    (d.length>=7?'-'+d.slice(6,8):'')+
    (d.length>=9?'-'+d.slice(8,10):'');
}
function setResultText(){const q=formQuote;$('#formQuote').innerHTML=q?`<b>${escaped(q.modelName)} · ${q.sizeId[0]} м</b><br>Допы (${q.options.length}): ${q.options.length?escaped(q.options.map(option=>option.name).join(', ')):'не выбраны'}<br><b>${money(q.total)} (демо)</b><br><span class="muted">Доставка и подключения — после уточнения.</span>`:'<b>Обратный звонок</b><br>Тема: помощь с выбором готовой бани.';}
function openForm(flow='quote'){
  formRequestId=crypto.randomUUID();
  formFlow=flow==='callback'?'callback':'quote';formQuote=formFlow==='quote'?quote():null;
  const callback=formFlow==='callback';$('#contactEyebrow').textContent=callback?'ОБРАТНЫЙ ЗВОНОК':'РАСЧЁТ МОЕЙ БАНИ';$('#contactTitle').textContent=callback?'Перезвоните мне':'Получить расчёт моей бани';$('#contactDesc').textContent=callback?'Оставьте номер телефона, чтобы менеджер «Гарант Бани» перезвонил вам.':'Ваша комплектация уже выбрана. Менеджер подтвердит цену и условия после получения заявки.';
  $('#quoteExtraFields').hidden=callback;$('#nameOptional').textContent=callback?'(необязательно)':'';$('#submitButton').textContent='Отправить заявку';$('#contactForm').hidden=false;$('#formResult').hidden=true;$('#formError').textContent='';$('#contactForm').reset();submitted=false;$('#formBack').textContent='Изменить заявку';$('#contactChannelField').hidden=callback;$('#contactForm').elements.contactChannel.value='phone';$('#phoneHint').textContent='Введите российский мобильный номер: +7 (9XX) XXX-XX-XX.';$('#phoneHint').dataset.valid='';$('#contactForm').elements.phone.removeAttribute('aria-invalid');
  if(!callback){$('#contactForm').elements.district.value=state.region;$('#contactForm').elements.base.value=state.base;$('#contactForm').elements.access.value=state.access;}
  setResultText();$('#contactDialog').showModal();$('#contactForm').elements.phone.focus();
}
function initForms(){
  const dialog=$('#contactDialog');
  const form=$('#contactForm');
  const submit=$('#submitButton');
  const result=$('#formResult');
  const error=$('#formError');
  const back=$('#formBack');
  const phone=form.elements.phone;
  const phoneHint=$('#phoneHint');
  const channel=form.elements.contactChannel;
  function showError(message,focusField){
    error.textContent=message;
    error.scrollIntoView({block:'nearest'});
    if(focusField)focusField.focus({preventScroll:true});
  }
  function updatePhoneHint(validateEmpty=false){
    const current=phone.value.trim();
    const valid=isRussianMobile(current);
    phoneHint.dataset.valid=valid?'true':(current||validateEmpty?'false':'');
    phoneHint.textContent=valid?'Формат номера корректен.':
      current||validateEmpty?'Проверьте номер: требуется +7 (9XX) XXX-XX-XX.':
      'Введите российский мобильный номер: +7 (9XX) XXX-XX-XX.';
    if(valid)phone.removeAttribute('aria-invalid');
    else if(current||validateEmpty)phone.setAttribute('aria-invalid','true');
    else phone.removeAttribute('aria-invalid');
    return valid;
  }
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-flow]');
    if(trigger)openForm(trigger.dataset.flow);
  });
  $('#dialogClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  back.addEventListener('click',()=>{
    if(submitted){dialog.close();return;}
    result.hidden=true;
    form.hidden=false;
  });
  phone.addEventListener('input',()=>{
    const formatted=formatRussianMobile(phone.value);
    if(phone.value!==formatted)phone.value=formatted;
    updatePhoneHint();
  });
  phone.addEventListener('blur',()=>updatePhoneHint(true));
  form.addEventListener('input',()=>{if(error.textContent)error.textContent='';});
  form.addEventListener('change',()=>{if(error.textContent)error.textContent='';});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submit.disabled)return;
    error.textContent='';
    const f=event.currentTarget;
    const name=f.elements.customerName.value.trim();
    const phoneValue=phone.value.trim();
    const contactChannel=formFlow==='callback'?'phone':channel.value;
    const district=f.elements.district.value.trim();
    const comment=f.elements.comment.value.trim();
    if(formFlow==='quote'&&name.length<2){showError('Укажите имя — минимум два символа.',f.elements.customerName);return;}
    if(name&&name.length<2){showError('Если указываете имя, напишите минимум два символа.',f.elements.customerName);return;}
    if(!updatePhoneHint(true)){showError('Проверьте мобильный номер: +7 (9XX) XXX-XX-XX.',phone);return;}
    if(formFlow==='quote'&&district.length<2){
      showError('Укажите город или район доставки.',f.elements.district);return;
    }
    const payload={
      flow:formFlow,name,phone:phoneValue,contactChannel,
      comment,consent:true,requestId:formRequestId,website:f.elements.website.value
    };
    if(formFlow==='quote'){
      payload.district=district;
      payload.base=f.elements.base.value;
      payload.access=f.elements.access.value;
      payload.configuration={
        modelId:formQuote.modelId,sizeId:formQuote.sizeId,
        optionIds:[...formQuote.optionIds],bundleId:state.bundleId,finish:state.finish
      };
    }
    submit.disabled=true;
    const originalLabel=submit.textContent;
    submit.textContent='Отправляем заявку…';
    try{
      const response=await fetch(new URL('api/lead',document.baseURI),{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(15000)
      });
      const receipt=await response.json().catch(()=>null);
      if(!response.ok||receipt?.ok!==true||receipt?.delivered!==true){
        if(response.status===429)throw new Error('RATE_LIMITED');
        if(response.status===401)throw new Error('AUTH_REQUIRED');
        if(response.status===400)throw new Error('INVALID_REQUEST');
        throw new Error('DELIVERY_FAILED');
      }
      submitted=true;
      result.querySelector('strong').textContent='Заявка отправлена';
      result.querySelector('p').textContent='Заявка доставлена менеджеру «Гарант Бани» в MAX. Мы свяжемся с вами выбранным способом.';
      back.textContent='Закрыть';
      form.hidden=true;
      result.hidden=false;
    }catch(cause){
      const messages={
        RATE_LIMITED:'Слишком много попыток. Повторите чуть позже.',
        AUTH_REQUIRED:'Требуется повторный вход на закрытый сайт. Обновите страницу и войдите снова.',
        INVALID_REQUEST:'Сервер не принял данные формы. Проверьте все поля и попробуйте ещё раз.',
        DELIVERY_FAILED:'Не удалось доставить заявку в MAX. Попробуйте повторно чуть позже.'
      };
      showError(messages[cause.message]||
        'Не удалось подтвердить доставку. Проверьте соединение и попробуйте ещё раз.');
    }finally{
      submit.disabled=false;
      submit.textContent=originalLabel;
    }
  });
}
function boot(){renderCatalog();renderBundle();initWeather();initAtmosphere();initBuilder();initMobileMenu();initForms();syncMedia();window.__GARANT_DEMO__={quote,applyBundle:()=>{state.modelId=bundle.modelId;state.sizeId=bundle.sizeId;state.optionIds=[...bundle.optionIds];state.bundleId=bundle.id;state.step=6;renderBuilder();},getState:()=>({step:state.step,modelId:state.modelId,sizeId:state.sizeId,optionIds:[...state.optionIds],bundleId:state.bundleId})};}
boot();
