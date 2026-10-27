import {applyPlanLabels} from './r94-plan-labels.mjs?v=r94-20261026';
import { appendReference as appendQhReference } from './qh-media/content.mjs';
import { appendReference as appendKqReference, referenceLabel as kqReferenceLabel } from './kvadro-media/content.mjs';
import { appendReference } from './parus-media/content.mjs';
import { MODEL_IDS, DEFAULT_STATE, normalizeState, availableOptions, sizeLabel, calculate, pricedOption, comfortState, dossier, rub } from './quote.mjs?v=r93-20261026';
import {analytics} from './analytics-runtime.mjs';
import { buildLead, buildCallback, normalizeSettlement, submitLead } from './lead-client.mjs?v=r93-20261026';
import { attachPhoneMask } from './phone-mask.mjs';
import { publicPackageName } from './r81-package-names.mjs?v=r93-20261026';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const profiles = {
  kvadro: { image: 'kvadro-garden-r7', name: 'Квадро', description: 'Длина 4–6 м · ширина 2,1 м · вход по центру' },
  viking: { image: 'viking-p3', name: 'Викинг', description: 'Длина 4–6 м · ширина 2,4 м · арочный вход по центру' },
  parus: { image: 'parus-garden-r7', name: 'Парус', description: 'Длина 4–6 м · ширина 2,4 м' },
  'kvadro-house': { image: 'house-p3', name: 'Квадро Хаус', description: 'Форматы 4 × 4, 5 × 4, 6 × 4, 6 × 5 и 6 × 6 м' },
};
document.addEventListener('dp:r85-change',event=>{if(!catalog)return;const patch=event.detail;state=normalizeState(catalog,{...state,...patch});interaction('dp_builder_interaction',{step:3,model:state.model,placement:'builder'});render();});
document.addEventListener('dp:r85-plan',event=>{if(!catalog)return;const plan=catalog.r85.plans.find(x=>x.id===event.detail.id);if(!plan)return;const same=state.model===plan.model&&state.size===plan.size;state=normalizeState(catalog,{...(same?state:{}),model:plan.model,size:plan.size,planId:plan.id,mirror:event.detail.mirror});interaction('dp_builder_interaction',{step:3,model:state.model,placement:'builder'});render();});
const STORAGE_KEY = 'dachapar-choice-r85-v1';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const contactDialog = $('#contact-dialog'), galleryDialog = $('#gallery-dialog');
let settlement = '', activeFlow = 'callback', quoteSnapshot = null;
let catalog = null, state = { ...DEFAULT_STATE }, hasSelection = false, activeGallery = 'kvadro', toastTimer, initialModel = null;
let settings = null, sendingLead = false, activeDetail = null, pendingPreset = null, submissionRequestId = null, lastSubmissionKey = null;

function track(name,params={}) { return analytics.track(name,params); }
let builderStarted=false, lastReviewedKey=null, formSucceeded=false;
function markBuilderStart(){if(!builderStarted){builderStarted=true;track('dp_builder_start',{placement:'builder'});}}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3300);
}

async function copy(text, success) {
  try { await navigator.clipboard.writeText(text); toast(success); return true; }
  catch { toast('Не удалось скопировать автоматически. Сохраните выбранный вариант файлом.'); return false; }
}

function interaction(event, params = {}) {
  markBuilderStart();
  hasSelection = true;
  track(event, params);
}

function persist() {
  if (!catalog || !hasSelection) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Selection remains available in memory. */ }
}

function makeButton(text, onClick, pressed = false, key = '') {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = text; button.setAttribute('aria-pressed', String(pressed));
  button.dataset.controlKey = key;
  button.addEventListener('click', onClick);
  return button;
}

function changePhoto(img, model, width = 960) {
  const target = 'assets/' + profiles[model].image + '-' + width + '.webp';
  if (img.getAttribute('src') !== target) img.src = target;
  img.alt = profiles[model].name + ', общий вид модели';
}

function paintControls() {
  const focusedKey = document.activeElement?.dataset.controlKey;
  const modelBox = $('#model-switch'), sizeBox = $('#size-switch');
  modelBox.replaceChildren(...MODEL_IDS.map(id => makeButton(profiles[id].name, () => selectModel(id, false), state.model === id, 'model-' + id)));
  $('#size-legend').textContent = catalog.models[state.model].sizeKind === 'full' ? 'Размер бани' : 'Длина бани';
  sizeBox.replaceChildren(...Object.keys(catalog.prices[state.model]).map(id => makeButton(sizeLabel(catalog, state.model, id), () => {
    state = normalizeState(catalog, { ...state, size: id });
    interaction('dp_size_select', { size: id, model: state.model, placement: 'landing_selection' });
    render();
  }, state.size === id, 'size-' + id)));
  const extraBox = $('#extras-list');
  const rows = availableOptions(catalog, state.model, state.size).map(([id, option]) => {
    // Only two ready-made terrace areas are offered to new visitors.
    // Previously saved 1–40 m² selections are retained without silent repricing.
    if(option.pricingMode==='area-input'){
      const row=document.createElement('div');row.className='extra-option terrace-option';
      const heading=document.createElement('strong');heading.className='terrace-title';
      heading.textContent=option.label.replace(/\s*[—-]\s*(площадь по проекту|полная стоимость)\s*$/i,'');
      const choices=document.createElement('div');choices.className='terrace-choices';
      for(const quantity of [10,20]){
        const active=state.options.includes(id)&&state.quantities[id]===quantity;
        const btn=makeButton(quantity+' м² — '+rub(option.unitPriceRub*quantity),()=>{
          const same=state.options.includes(id)&&state.quantities[id]===quantity;
          const ids=state.options.filter(k=>catalog.options[k].mutex!=='terrace');
          const quantities={...state.quantities};
          for(const k of state.options)if(catalog.options[k].mutex==='terrace')delete quantities[k];
          if(!same){ids.push(id);quantities[id]=quantity;}
          state=normalizeState(catalog,{...state,options:ids,quantities});
          interaction('dp_builder_interaction',{placement:'landing_selection',step:3});
          render();
        },active,'terrace-'+id+'-'+quantity);
        btn.className='terrace-choice';
        btn.setAttribute('aria-label',option.label.replace(/\s*[—-]\s*(площадь по проекту|полная стоимость)\s*$/i,'')+', '+quantity+' м², '+rub(option.unitPriceRub*quantity));
        choices.append(btn);
      }
      row.append(heading,choices);
      const oldQty=state.options.includes(id)?state.quantities[id]:null;
      if(oldQty!=null&&![10,20].includes(oldQty)){
        const legacy=document.createElement('p');legacy.className='terrace-legacy';
        legacy.textContent='В вашем сохранённом варианте: '+oldQty+' м² — '+rub(option.unitPriceRub*oldQty)+'. Для изменения выберите 10 или 20 м².';
        row.append(legacy);
      }
      return row;
    }
    const row=document.createElement('div');row.className='extra-option';
    const label=document.createElement('label');label.className='extra-selector';
    const input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=state.options.includes(id);
    const name=document.createElement('span');name.textContent=option.label;
    const price=document.createElement('span');price.className='extra-price';
    const areaOption=option.pricingMode==='area-input';
    const updatePrice=()=>{const amount=pricedOption(catalog,state,id).amount;
      price.textContent=areaOption&&!state.options.includes(id) ? 'Площадь по проекту' : '+ '+rub(amount);
    };
    let area=null,areaLabel=null;
    if(areaOption){
      areaLabel=document.createElement('label');areaLabel.className='extra-area-label';
      areaLabel.htmlFor='extra-area-'+id;areaLabel.textContent='Площадь, м²';
      area=document.createElement('input');area.type='number';area.id='extra-area-'+id;
      area.min='1';area.max='40';area.step='1';area.inputMode='numeric';area.className='extra-area';
      area.value=String(state.quantities[id]??1);area.required=true;
      area.setAttribute('aria-label','Площадь '+option.label+', м²');
      const onArea=()=>{const qty=Number(area.value);if(!Number.isSafeInteger(qty)||qty<1||qty>40){
        area.setCustomValidity('Укажите площадь от 1 до 40 м².');area.reportValidity();return;
      }
        area.setCustomValidity('');state=normalizeState(catalog,{...state,quantities:{...state.quantities,[id]:qty}});
        updatePrice();interaction('dp_builder_interaction',{placement:'builder',step:3});render();
      };
      area.addEventListener('input',()=>{const qty=Number(area.value);if(Number.isSafeInteger(qty)&&qty>=1&&qty<=40)onArea();});
      area.addEventListener('change',onArea);
      areaLabel.append(area);
    }
    const sync=()=>{for(const peer of extraBox.querySelectorAll('input[type=checkbox]'))peer.checked=state.options.includes(peer.value);
      for(const peer of extraBox.querySelectorAll('.extra-option')){
        const check=peer.querySelector('input[type=checkbox]'),qty=peer.querySelector('.extra-area-label');
        if(!check)continue; // Terrace variants are buttons, not checkboxes.
        if(qty){qty.hidden=!check.checked;qty.querySelector('input').disabled=!check.checked;}
        const rate=peer.querySelector('.extra-price'),op=catalog.options[check.value];
        rate.textContent=op.pricingMode==='area-input'&&!check.checked?'Площадь по проекту':'+ '+rub(pricedOption(catalog,state,check.value).amount);
      }
    };
    input.addEventListener('change',()=>{
      const ids=new Set(state.options);input.checked?ids.add(id):ids.delete(id);
      if(input.checked&&option.mutex)for(const peerId of ids)if(peerId!==id&&catalog.options[peerId].mutex===option.mutex)ids.delete(peerId);
      state=normalizeState(catalog,{...state,options:[...ids]});sync();
      interaction('dp_builder_interaction',{placement:'landing_selection',step:3});updateQuote();persist();
    });
    label.append(input,name,price);row.append(label);
    if(areaLabel){areaLabel.hidden=!input.checked;area.disabled=!input.checked;row.append(areaLabel);}
    updatePrice();return row;
  });
  extraBox.replaceChildren(...rows);
  for(const [id,kind,key]of [['finish-select','body','finish'],['roof-select','roof','roof']]){
    const select=$('#'+id),placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Обсудим с менеджером';
    select.replaceChildren(placeholder,...catalog.finishes[kind].map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;return option;}));select.value=state[key];
  }

  if (focusedKey) $('[data-control-key="' + CSS.escape(focusedKey) + '"]')?.focus({ preventScroll: true });
}

function updateQuote() {
  if (!catalog) return;
  const q = calculate(catalog, state); state = q.state;
  $('#base-total').textContent = rub(q.base);
  $('#base-label').textContent = state.package==='deluxe'?'Комплектация Делюкс':'Комплектация Комфорт';
  $('#deluxe-story').hidden = state.package!=='deluxe';
  $('#extras-total').textContent = rub(q.extras);
  $('#installation-row').hidden = !q.installation; $('#installation-total').textContent = rub(q.installation);
  $('#extras-breakdown').hidden = !q.lines.some(x=>!x.included);
  const total = $('#quote-total');const displayTotal=q.priceStatus==='calculated'&&!q.wideBody?'≈ '+rub(q.knownTotalRub):rub(q.total);
  if (total.textContent !== displayTotal) {
    total.textContent = displayTotal;
    if (!reduced.matches && total.animate) total.animate([{ opacity: .55, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' });
  }
  $('#extra-count').textContent = state.options.length ? '(' + state.options.length + ')' : '';
  $('#installation-label').textContent = q.installation?'Сборка на участке':'';
  const packageName=publicPackageName(catalog,state);
  if ($('#r81-package-name')) $('#r81-package-name').textContent=packageName;
  $('input[name=package][value=base]').checked = state.package !== 'deluxe';
  $('input[name=package][value=comfort]').checked = q.comfort;
  $('#package-help').textContent = q.comfort ? 'Цена «Делюкса» включает все отмеченные улучшения, в том числе стеклянную дверь и оборудование «Комфорта». Повторно за них не платите.' :
    state.options.length ? 'Вы выбрали улучшения. Включённые удобства повторно не оплачиваются.' :
      (catalog.models[state.model].baseEntrance || catalog.baseInclusions.modelSpecific[state.model]);
  $('#closing-selection').hidden = !hasSelection;
  $('#closing-variant').textContent = profiles[state.model].name + ' · ' + sizeLabel(catalog, state.model, state.size) + ' · ' + displayTotal;
}

function render() {
  if (!catalog) return;
  state = normalizeState(catalog, state);
  paintControls();
  changePhoto($('#config-photo'), state.model);
  $('#config-name').textContent = profiles[state.model].name;
  const model = catalog.models[state.model];
  $('#config-dimensions').textContent = sizeLabel(catalog, state.model, state.size) + (model.widthM ? ' · ширина ' + model.widthM.toLocaleString('ru-RU') + ' м' : ' · формат выбранного варианта');
  const chosenPlan=catalog.r85.plans.find(p=>p.id===state.planId);if(chosenPlan?.wideBody)$('#config-dimensions').textContent=chosenPlan.sizeLabel+' · стоимость корпуса уточним';
  $('#comfort-choice').hidden = !catalog.r85.models[state.model]?.sizes[state.size]?.deluxe;
  if($('#comfort-choice .package-caption'))$('#comfort-choice .package-caption').textContent=catalog.models[state.model].name;
  $('#region').value = settlement;
  updateQuote(); persist();
  window.__r85={book:catalog.r85,state:structuredClone(state),siteModels:catalog.models};document.dispatchEvent(new CustomEvent('dp:r85-render',{detail:window.__r85}));
}

function goToConfig() {
  $('#configure').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
  const heading = $('#configure-title'); heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true });
}

function selectModel(model, scroll = true) {
  if (!MODEL_IDS.includes(model)) return;
  if (catalog) {
    const matchingSize = Object.hasOwn(catalog.prices[model], state.size) ? state.size : Object.keys(catalog.prices[model])[0];
    state = normalizeState(catalog, { ...state, model, size: matchingSize, options: [] });
    interaction('dp_model_select', { model, placement: scroll ? 'landing_catalog' : 'landing_selection' });
    render();
  } else initialModel = model;
  if (scroll) goToConfig();
}

function setMenu() {} // The phone-only header has no menu state.

$$('[data-select-model]').forEach(b => b.addEventListener('click', () => selectModel(b.dataset.selectModel)));
$$('[data-cta]').forEach(a => a.addEventListener('click', () => track('dp_cta_click', { placement: 'landing_' + a.dataset.cta })));

function openContact(flow = 'callback', placement = 'page') {
  setMenu(false);
  if (sendingLead) { if (!contactDialog.open) contactDialog.showModal(); return; }
  activeFlow = flow === 'quote' && catalog ? 'quote' : 'callback';
  const callback = activeFlow === 'callback';
  formSucceeded=false;
  if(!callback)markBuilderStart();
  // A request for a free plan is not itself a model selection. Never create a
  // default 5 m Quadro order merely because the visitor opened this dialog.
  if (!callback && hasSelection) { updateQuote(); persist(); quoteSnapshot = structuredClone(state); }
  else quoteSnapshot = null;
  $('#contact-eyebrow').textContent = callback ? 'Поможем с выбором' : quoteSnapshot ? 'Ваш выбранный вариант' : 'Подберём ваш вариант';
  $('#contact-title').textContent = callback ? (new URLSearchParams(location.search).has('request') ? 'Поможем выбрать баню бесплатно' : 'Перезвоните мне') : 'Бесплатная планировка и расчёт вашей бани';
  $('.dialog-intro', contactDialog).textContent = callback ? 'Оставьте телефон — менеджер перезвонит и ответит на ваши вопросы.' : 'Подберём индивидуальную комплектацию, подготовим планировку, чертёж и расчёт и пришлём вам. Оставьте контакт для ответа.';
  $('#contact-variant').replaceChildren(); $('#contact-variant').hidden = callback;
  if (!callback && !quoteSnapshot) {
    const name = document.createElement('strong'); name.textContent = 'Помочь выбрать модель';
    const note = document.createElement('span'); note.textContent = 'Расскажите, что важно в вашей бане. Начнём с телефонного звонка, затем подготовим планировку и расчёт.';
    $('#contact-variant').append(name, note);
  }
  if (!callback && quoteSnapshot) {
    const q = calculate(catalog, quoteSnapshot);
    const name = document.createElement('strong'); name.textContent = profiles[quoteSnapshot.model].name + ' · ' + sizeLabel(catalog, quoteSnapshot.model, quoteSnapshot.size) + ' · ' + publicPackageName(catalog,quoteSnapshot) + ' · ' + (q.priceStatus==='calculated'&&!q.wideBody?'≈ '+rub(q.knownTotalRub):rub(q.total));
    const note = document.createElement('span'); note.textContent = (q.priceStatus==='calculated'&&!q.wideBody?'Предварительная цена: состав и стоимость подтвердим до заказа. ':'')+'Доставку и подготовку участка рассчитаем по вашему адресу.';
    const details = document.createElement('details'); details.className = 'quote-options';
    const summary = document.createElement('summary'); summary.textContent = 'Что входит в мой вариант';
    const list = document.createElement('ul');
    for (const text of [...catalog.baseInclusions.common, ...(q.plan?['Планировка: '+q.plan.title+(q.plan.mirror?' · зеркально':'')]:[]), ...q.lines.filter(x=>!x.included).map(x=>x.name+' · '+x.quantity+' '+x.unit+' · '+rub(x.price)), ...q.pendingReasons.map(x=>'Уточним: '+x),...(quoteSnapshot.finish?['Оттенок корпуса: '+catalog.finishes.body.find(x=>x.id===quoteSnapshot.finish).name]:[]),...(quoteSnapshot.roof?['Кровля: '+catalog.finishes.roof.find(x=>x.id===quoteSnapshot.roof).name]:[])]) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
    details.append(summary, list); $('#contact-variant').append(name, note, details);
  }
  $('#quote-contact-fields').hidden = callback;
  $('#lead-name-field').hidden = callback; $('#lead-name').disabled = callback; $('.lead-form-grid').classList.toggle('callback-only',callback);
  if (!quoteSnapshot) $('#lead-channel').value = 'phone';
  $('#lead-channel').disabled = callback || !quoteSnapshot; $('#lead-settlement').disabled = callback;
  $('#lead-settlement').value = settlement;
  $('#relay-submit').textContent = callback ? 'Заказать звонок' : 'Отправить запрос бесплатно';
  $('#relay-result').hidden = true; $('#relay-lead-form').hidden = false; $('#relay-error').hidden = true;
  updatePhoneHint();
  if (!contactDialog.open) contactDialog.showModal();
  if(!callback && quoteSnapshot){const key=JSON.stringify(quoteSnapshot);if(key!==lastReviewedKey){lastReviewedKey=key;track('dp_builder_complete',{placement:'builder',model:quoteSnapshot.model});}}
  $('#lead-phone').focus();
  track('dp_cta_click', { placement: 'landing_' + placement }); track('dp_form_open', { flow: activeFlow });
}
$$('[data-flow]').forEach(b => b.addEventListener('click', () => openContact(b.dataset.flow, b.dataset.placement || 'page')));
contactDialog.addEventListener('close', () => {if(!formSucceeded)track('dp_form_close', { flow: activeFlow });});

function updatePhoneHint() {
  const channel = activeFlow === 'callback' ? 'phone' : $('#lead-channel').value;
  const labels = {phone:'Позвоним по этому номеру.', max:'Напишем в MAX по этому номеру. Если не получится — позвоним.', telegram:'Напишем в Telegram по этому номеру. Если не получится — позвоним.', whatsapp:'Напишем в WhatsApp по этому номеру. Если не получится — позвоним.'};
  $('#lead-phone-hint').textContent = labels[channel] || labels.phone;
}

function openGallery(model) {
  if (!MODEL_IDS.includes(model)) return;
  activeDetail = null;
  $('#gallery-select').firstChild.textContent = 'Выбрать модель ';
  $('.gallery-caption small').textContent = 'Внешний вид, отделку и оснащение согласуем перед заказом.';
  activeGallery = model;
  changePhoto($('#gallery-photo'), model, 1536);
  $('#gallery-title').textContent = profiles[model].name;
  $('#gallery-description').textContent = profiles[model].description;
  if (!galleryDialog.open) galleryDialog.showModal();
  track('dp_gallery_open', { model, placement: 'landing_catalog' });
}
$$('[data-gallery]').forEach(b => b.addEventListener('click', () => openGallery(b.dataset.gallery)));
$('#config-zoom').addEventListener('click', () => openGallery(state.model));
$('#gallery-select').addEventListener('click', () => { galleryDialog.close(); if (activeDetail) goToConfig(); else selectModel(activeGallery); });
$$('[data-close-dialog]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } }));
$$('a[href^="tel:"]').forEach(a => a.addEventListener('click', () => track('dp_phone_click', { placement: a.dataset.phonePlacement || 'landing_contact' })));

$$('input[name=package]').forEach(input => input.addEventListener('change', () => {
  if (!catalog) return;
  state = input.value === 'comfort' ? comfortState(catalog, state) : normalizeState(catalog, { ...state, package:'comfort',doors:[{id:'entry',sku:'OPT_16'},{id:'steam',sku:'OPT_14'}],windows:[{id:'window1',sku:'OPT_28'}] });
  interaction('dp_builder_interaction', { step: 3, package:input.value, model:state.model, size:state.size, placement: 'landing_selection' });
  render();
}));
$('#region').addEventListener('input', () => { settlement = normalizeSettlement($('#region').value); });
function variantText() { return dossier(catalog, state) + (settlement ? '\n\nОбласть, населённый пункт: ' + settlement : ''); }
$('#save-variant').addEventListener('click', () => {
  if (!catalog) return;
  hasSelection = true; updateQuote();
  const blob = new Blob(['\uFEFF' + variantText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'DachaPar-' + state.model + '-' + state.size + '.txt'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Вариант подготовлен для сохранения.');
});
$('#share-variant').addEventListener('click', () => {
  if (!catalog) return;
  const url = new URL(location.href); url.search = ''; url.hash = 'configure';
  url.searchParams.set('model', state.model); url.searchParams.set('size', state.size);if(state.finish)url.searchParams.set('finish',state.finish);if(state.roof)url.searchParams.set('roof',state.roof);
  url.searchParams.set('choice',JSON.stringify(state));
  if(Object.keys(state.quantities).length)url.searchParams.set('area',Object.entries(state.quantities).map(([id,n])=>id+':'+n).join(','));
  // Contact details and location are never placed into a shared URL.
  copy(url.href, 'Ссылка на выбранную баню скопирована.');
});

// Scene and foreground travel at different rates. The cabin and its support
// remain one physical plane; the typography never depends on scroll progress.
let heroVisible = true, frame = 0, pointerX = 0, pointerY = 0;
const hero = $('#hero');
function drawScene() {
  frame = 0;
  const p = reduced.matches ? 0 : Math.max(0, Math.min(1, scrollY / hero.offsetHeight));
  const mobile = innerWidth <= 700;
  hero.style.setProperty('--hero-shift', (p * (mobile ? 20 : 70)).toFixed(2) + 'px');
  hero.style.setProperty('--leaf-shift', (-p * (mobile ? 25 : 85)).toFixed(2) + 'px');
  hero.style.setProperty('--pointer-x', (reduced.matches ? 0 : pointerX).toFixed(2) + 'px');
  hero.style.setProperty('--pointer-y', (reduced.matches ? 0 : pointerY).toFixed(2) + 'px');
  hero.style.setProperty('--plate-scale', (1 + p * .025).toFixed(4));
  hero.style.setProperty('--subject-scale', (1 + p * .008).toFixed(4));
}
function scheduleScene() { if (heroVisible && !frame && !document.hidden) frame = requestAnimationFrame(drawScene); }
addEventListener('scroll', scheduleScene, { passive: true });
addEventListener('resize', scheduleScene, { passive: true });
reduced.addEventListener('change', drawScene);
const fine = matchMedia('(hover: hover) and (pointer: fine)');
hero.addEventListener('pointermove', e => { if (!fine.matches || reduced.matches) return; pointerX = (e.clientX / innerWidth - .5) * 10; pointerY = (e.clientY / hero.offsetHeight - .5) * 5; scheduleScene(); }, { passive: true });
hero.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; scheduleScene(); });
if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => { heroVisible = entries[0].isIntersecting; if (heroVisible) scheduleScene();  }, { threshold: 0 }).observe(hero);
  const views = new Set();
  const observer = new IntersectionObserver(entries => entries.forEach(e => { const id = e.target.dataset.modelCard; if (e.isIntersecting && !views.has(id)) { views.add(id); track('dp_model_view', { model: id, placement: 'landing_catalog' }); } }), { threshold: .5 });
  $$('[data-model-card]').forEach(el => observer.observe(el));
}
drawScene();

try { window.ScrollCraft?.mount(document); }
catch { document.documentElement.classList.remove('sc-ready'); $$('[data-sc-in]').forEach(el => el.classList.add('sc-in')); }


function applyPreset(type, placement = 'landing_packages') {
  if (!['base','comfort'].includes(type)) return;
  if (!catalog) { pendingPreset = {type,placement}; return; }
  state = type === 'comfort' ? comfortState(catalog, state) : normalizeState(catalog, {...state,model:'kvadro',size:'500',options:[],quantities:{}});
  interaction('dp_builder_interaction', { step: 3, package:type, model:state.model, size:state.size, placement }); render();
}
$$('[data-preset]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();applyPreset(a.dataset.preset,'landing_'+(a.dataset.placement||'packages'));goToConfig();}));
$$('[data-add-led]').forEach(button=>button.addEventListener('click',()=>{
  if (!catalog) { goToConfig(); return; }
  const id='OPT_81'; const already=state.options.includes(id);
  state=normalizeState(catalog,{...state, options:[...new Set([...state.options,id])]});
  interaction('dp_builder_interaction',{step:'options',placement:'landing_details'});render();goToConfig();
  toast(already?'Подсветка уже учтена в выбранной стоимости.':'Подсветка добавлена к вашему варианту.');
}));
const detailScenes={
  venik:{image:'detail-venik-p2',title:'Ваш банный ритуал',text:'Берёзовый веник, тёплое дерево и время для себя.'},
  stove:{image:'detail-stove-p2',title:'Ближе к теплу',text:'Печь и дымоход входят в базовое оснащение. Конкретная модель указывается в спецификации.'},
  led:{image:'detail-led-p2',title:'Свет для спокойного вечера',text:'Тёплый свет для приятного банного вечера. Подсветку можно выбрать в составе оснащения.'}
};
$$('[data-detail]').forEach(button=>button.addEventListener('click',()=>{
  const detail=detailScenes[button.dataset.detail];if(!detail)return;
  activeDetail=button.dataset.detail;$('#gallery-photo').src='assets/'+detail.image+'-1536.webp';$('#gallery-photo').alt=detail.title;
  $('#gallery-title').textContent=detail.title;$('#gallery-description').textContent=detail.text;
  $('.gallery-caption small').textContent='Модель печи, отделку и оснащение согласуем при заказе.';
  $('#gallery-select').firstChild.textContent='Подобрать баню ';galleryDialog.showModal();
}));

$('#base-kit-open').addEventListener('click',()=>{
 if(!catalog)return;const box=$('#base-kit-items');box.replaceChildren();
 for(const text of [...catalog.baseInclusions.common,catalog.baseInclusions.modelSpecific[state.model]]){const li=document.createElement('li');li.textContent=text;box.append(li);}
 $('#base-kit-title').textContent='Что входит в Комфорт · '+profiles[state.model].name;
 $('#base-kit-dialog').showModal();track('dp_base_kit_open',{placement:'base',model:state.model});
});
for(const [id,key]of [['finish-select','finish'],['roof-select','roof']])$('#'+id).addEventListener('change',e=>{state=normalizeState(catalog,{...state,[key]:e.target.value});interaction('dp_builder_interaction',{placement:'builder',step:3});render();});
attachPhoneMask($('#lead-phone'));
$('#lead-channel').addEventListener('change', updatePhoneHint);
$('#lead-settlement').addEventListener('input', () => { settlement = normalizeSettlement($('#lead-settlement').value); $('#region').value = settlement; });
$('#relay-edit').addEventListener('click', () => { $('#relay-result').hidden = true; $('#relay-lead-form').hidden = false; $('#relay-error').hidden = true; $('#lead-phone').focus(); });
$('#relay-lead-form').addEventListener('submit', async e => {
  e.preventDefault(); if (sendingLead) return;
  $('#relay-error').hidden = true; $('#relay-result').hidden = true; $('#lead-phone').removeAttribute('aria-invalid');
  const flow = activeFlow;
  const fields = {name:flow === 'callback' ? '' : $('#lead-name').value, phone:$('#lead-phone').value, channel:flow === 'callback' ? 'phone' : $('#lead-channel').value, settlement:$('#lead-settlement').value};
  let payload;
  try {
    const id = submissionRequestId || crypto.randomUUID();
    // The existing callback API carries a no-model free-plan request in its
    // comment field. Sending a made-up configuration would be misleading.
    payload = flow === 'callback' || !quoteSnapshot ? buildCallback(fields,id) : buildLead(catalog,quoteSnapshot,fields,id);
    // R73 legal release: evidence matches the linked 2026-10-21 consent.
    payload.consent = true;
    payload.consentVersion = '2026-10-21';
    payload.consentMethod = 'submit-button-v2';
    const attribution=analytics.attribution();if(attribution)payload.attribution=attribution;
    if (flow === 'quote' || new URLSearchParams(location.search).get('request')) {
      const params = new URLSearchParams(location.search);
      const plan = quoteSnapshot?.planId || (params.get('plan')||'').match(/^[a-zA-Z0-9_-]{1,90}$/)?.[0] || '';
      const intended = params.get('request') === 'deluxe' ? 'комплектация Делюкс, полный состав и цена' : params.get('request') === 'custom' ? 'индивидуальная планировка' : 'индивидуальная комплектация, планировка, чертёж и расчёт';
      payload.comment = 'Бесплатный запрос: '+intended+'. '+(!quoteSnapshot && flow === 'quote' ? 'Модель и размер не выбраны — помочь подобрать. ' : '')+(plan?'Интерес к планировке '+plan+'. ':'')+'Контакт для уточнения пожеланий и отправки материалов.';
    }
    payload = appendReference(payload, $('#relay-lead-form').dataset.parusReference);
    payload = appendQhReference(payload, $('#relay-lead-form').dataset.qhReference);
    payload = appendKqReference(payload, $('#relay-lead-form').dataset.kvadroReference);
    const {requestId,...content} = payload;
    const key = JSON.stringify(content);
    if (key !== lastSubmissionKey) { submissionRequestId = crypto.randomUUID(); lastSubmissionKey = key; }
    payload.requestId = submissionRequestId;
  } catch {
    $('#relay-error').textContent = 'Проверьте номер мобильного телефона.'; $('#relay-error').hidden = false; $('#lead-phone').setAttribute('aria-invalid','true'); $('#lead-phone').focus(); track('dp_form_error',{flow}); return;
  }
  sendingLead = true;
  $$('#relay-lead-form input, #relay-lead-form select, #relay-lead-form button').forEach(el => {el.disabled = true;});
  const label = $('#relay-submit').textContent; $('#relay-submit').textContent = 'Отправляем…';
  try {
    const result = await submitLead(payload,settings,location.origin);
    $('#relay-result-title').textContent = result.duplicate ? 'Заявка уже получена' : 'Заявка отправлена';
    const names = {max:'MAX',telegram:'Telegram',whatsapp:'WhatsApp'};
    $('#relay-result-text').textContent = flow === 'quote' || new URLSearchParams(location.search).has('request') ? 'Запрос получили. Уточним пожелания, подготовим планировку и расчёт и пришлём вам.' : flow === 'callback' || fields.channel === 'phone' ? 'Менеджер перезвонит по указанному номеру.' : 'Ответим в ' + names[fields.channel] + ' по указанному номеру. Если написать не получится, позвоним.';
    $('#relay-result').hidden = false; $('#relay-lead-form').hidden = true;
    formSucceeded=true;
    analytics.confirmed(result.receipt,{flow,requestId:payload.requestId});
  } catch (error) {
    $('#relay-error').textContent = error.message === 'RATE_LIMITED' ? 'Слишком много попыток. Попробуйте позже или позвоните нам.' : error.message === 'IN_PROGRESS' ? 'Заявка ещё отправляется. Подождите немного и повторите попытку.' : 'Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.';
    $('#relay-error').hidden = false; track('dp_form_error',{flow});
  } finally {
    sendingLead = false;
    $$('#relay-lead-form input, #relay-lead-form select, #relay-lead-form button').forEach(el => {el.disabled = (flow === 'callback' && (!!el.closest('#quote-contact-fields') || el.id === 'lead-name')) || (flow === 'quote' && !quoteSnapshot && el.id === 'lead-channel');});
    $('#relay-submit').textContent = label;
  }
});

const settingsRequest = fetch('data/site-settings.json',{cache:'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null);

try {
  const response = await fetch('data/catalog-pricebook.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Catalog load failed');
  catalog = await response.json();
  applyPlanLabels(catalog.r85.plans);
  if (catalog.version !== 'DP-DELUXE-ALL-MODELS-20261026-R93' || MODEL_IDS.some(id => !catalog.prices[id])) throw new Error('Catalog revision mismatch');
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem('dachapar-weekend-variant-v1')); } catch { saved = null; }
  const params = new URLSearchParams(location.search);
  const areas={};for(const pair of (params.get('area')||'').split(',')){const match=pair.match(/^([a-z0-9_]+):(\d{1,2})$/);if(match)areas[match[1]]=Number(match[2]);}
  let r85Shared=null;try{const p=params.get('choice');if(p&&p.length<12000)r85Shared=JSON.parse(p)}catch{}
  const oldPlan=catalog.r85.plans.find(x=>x.id===params.get('plan'));
  const shared = r85Shared || ((params.has('model')||params.has('plan')) ? { model: params.get('model')||oldPlan?.model||'kvadro', size: params.get('size')||oldPlan?.size||undefined, options: (params.get('options') || '').split(','),quantities:areas,finish:params.get('finish'),roof:params.get('roof'),planId:params.get('plan'),mirror:params.get('planMirror')==='1',package:params.get('request')==='deluxe'?'deluxe':'comfort' } : null);
  state = normalizeState(catalog, {...(shared || saved || {...DEFAULT_STATE,size:'400'}),region:''});
  hasSelection = Boolean(shared || saved);
  $('#config-app').hidden = false;$('#base-kit-open').hidden=false;
  render();
  if (initialModel) selectModel(initialModel, false);
  if (pendingPreset) applyPreset(pendingPreset.type,pendingPreset.placement);
  window.ScrollCraft?.instances.forEach(instance => instance.layout());
} catch {
  $('#config-app').hidden = true;
  $('#load-error').hidden = false;
}

settings = await settingsRequest;
const callbackEntry = new URLSearchParams(location.search).get('callback');
const legacyCallback=new URLSearchParams(location.search).get('contact')==='manager'||location.hash==='#contactDialog';
analytics.start(settings,{optionIds:Object.keys(catalog?.options||{}),finishIds:catalog?.finishes.body.map(x=>x.id)||[],roofIds:catalog?.finishes.roof.map(x=>x.id)||[]});
if (['help','delivery'].includes(callbackEntry)||legacyCallback) openContact('callback',callbackEntry||'seo');
else if (new URLSearchParams(location.search).get('request') === 'plan' && catalog) openContact('quote','free_plan');
else if (new URLSearchParams(location.search).get('request') === 'custom') openContact('callback','custom_plan');

// R8.1: selected verified Quadro photo, pass its reference in the existing comment field.
const kqId=new URLSearchParams(location.search).get('kvadroRef');
if (kqReferenceLabel(kqId)){
  const form=$('#relay-lead-form');if(form)form.dataset.kvadroReference=kqId;
  $('#contact-dialog')?.addEventListener('close',()=>{if(form)delete form.dataset.kvadroReference;});
}
