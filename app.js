'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const leadDialog = $('#leadDialog');
const modelSelect = $('#configModel');
const sizeSelect = $('#configSize');
function configureSizes() {
  const model = modelSelect.value;
  const lengths = model === 'Квадро Хаус' ? ['5 м','6 м'] : (model === 'Квадро' ? ['4 м','5 м','6 м'] : ['Уточнить модель и размер']);
  const prev = sizeSelect.value;
  sizeSelect.replaceChildren(...[...lengths, 'Пока не знаю — помогите выбрать'].map(x => new Option(x,x)));
  if (lengths.includes(prev)) sizeSelect.value = prev;
  updateSummary();
}
function selections(){return $$('.checks input:checked').map(x => x.value);}
function updateSummary(){const parts = [modelSelect.value, sizeSelect.value]; const chosen = selections(); $('#configSummary').textContent = parts.join(' · ') + (chosen.length?' · '+chosen.length+' доп. опц.':'');}
modelSelect.addEventListener('change',configureSizes); sizeSelect.addEventListener('change',updateSummary);$$('.checks input').forEach(x=>x.addEventListener('change',updateSummary));
$$('[data-weather]').forEach(btn=>btn.addEventListener('click',()=>{const rain = btn.dataset.weather === 'rain';$('#heroVisual').classList.toggle('hero-visual-rain',rain);$('#heroVisual').classList.toggle('hero-visual-sunny',!rain);$('#heroVisual').setAttribute('aria-label',rain?'Готовая баня на обычном участке в дождливую погоду с тёплым светом внутри':'Готовая баня на дачном участке в солнечный день');$$('[data-weather]').forEach(x=>{x.classList.toggle('is-active',x===btn);x.setAttribute('aria-pressed',String(x===btn));});$('#heroTitle').innerHTML=rain?'За окном дождь.<br>А у вас —<br><em>своя баня.</em>':'Приехали на дачу.<br>Растопили баню.<br><em>Отдых начался.</em>';$('#heroLead').textContent=rain?'На улице сыро, а внутри светло и тепло. Самое время собраться вместе — и никуда не торопиться.':'Пятница, близкие рядом и своя парилка. Баню изготовим заранее и привезём готовой — без долгой стройки на вашем участке.';}));
$$('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{const filter=btn.dataset.filter;$$('[data-filter]').forEach(x=>{x.classList.toggle('is-active',x===btn);x.setAttribute('aria-selected',String(x===btn));});$$('[data-model]').forEach(card=>card.hidden=(filter!=='all'&&card.dataset.model!==filter));}));
function leadMessage(){const city=$('#leadCity').value.trim(), contact=$('#leadContact').value.trim(), chosen=selections();return ['Здравствуйте! Хочу получить актуальный расчёт готовой бани «Гарант Бани».','Модель: '+$('#leadModel').value,'Длина / размер: '+(modelSelect.value===$('#leadModel').value?sizeSelect.value:'нужна консультация'),chosen.length?'Интересуют опции: '+chosen.join(', '):'Опции: уточним с менеджером','Город/район установки: '+(city||'уточню'),contact?'Контакт: '+contact:'Контакт: сообщу отдельно','Прошу уточнить комплектацию, доставку, установку и готовность к использованию.'].join('\n');}
function refreshLead(){ $('#leadPreview').textContent=leadMessage(); }
function openLead(model){if(model){$('#leadModel').value=model; modelSelect.value=model;configureSizes();} else $('#leadModel').value=modelSelect.value;$('#copyFeedback').textContent='';refreshLead();leadDialog.showModal();}
$$('[data-open-lead]').forEach(btn=>btn.addEventListener('click',()=>openLead()));$$('[data-pick-model]').forEach(btn=>btn.addEventListener('click',()=>openLead(btn.dataset.pickModel)));$('#configSubmit').addEventListener('click',()=>openLead());['leadModel','leadCity','leadContact'].forEach(id=>$('#'+id).addEventListener('input',refreshLead));
$('#copyLead').addEventListener('click',async()=>{const message=leadMessage();try{await navigator.clipboard.writeText(message);$('#copyFeedback').textContent='Запрос скопирован. Передайте его менеджеру.';}catch(e){const field=$('#leadPreview');const range=document.createRange();range.selectNodeContents(field);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);$('#copyFeedback').textContent='Выделите текст и скопируйте вручную.';}});
leadDialog.addEventListener('click',e=>{if(e.target===leadDialog)leadDialog.close();});
const toggle=$('.menu-toggle');toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));$('#primaryNav').classList.toggle('is-open',!open);});$$('.nav a').forEach(a=>a.addEventListener('click',()=>{toggle.setAttribute('aria-expanded','false');$('#primaryNav').classList.remove('is-open');}));
configureSizes();