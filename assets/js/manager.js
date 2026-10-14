'use strict';
const $=selector=>document.querySelector(selector);
const API=new URL('api/manager/',document.baseURI).toString();
const state={offset:0,limit:30,selected:null,busy:false,sessionEpoch:0,site:'all'};
const statuses={
  new:'Новая',in_progress:'В работе',awaiting_customer:'Ждём клиента',
  quote_sent:'КП отправлено',won:'Продано',lost:'Закрыто без продажи'
};
const channels={phone:'Звонок',telegram:'Telegram',max:'MAX',whatsapp:'WhatsApp'};
const finishes={natural:'Натуральное дерево',walnut:'Тёплый орех',graphite:'Графит'};
const bases={unknown:'Нужно уточнить',ready:'Готово',advice:'Нужна консультация'};
const access={unknown:'Нужно уточнить',yes:'Есть подъезд',advice:'Нужна консультация'};
const money=value=>typeof value==='number'?new Intl.NumberFormat('ru-RU').format(value)+' ₽':'—';
const displaySize=value=>/^\d{3}$/.test(String(value))?(Number(value)/100).toLocaleString('ru-RU')+' м':String(value).replace('x','×')+' м';
const date=value=>value?new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Moscow'}).format(new Date(value)):'—';
const el=(tag,cls='',value='')=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(value!==undefined&&value!==null)node.textContent=String(value);
  return node;
};
function pair(dl,label,value){
  dl.append(el('dt','',label),el('dd','',value===undefined||value===null||value===''?'—':value));
}
function statusPill(value){
  const pill=el('span','status-pill',statuses[value]||value||'—');
  pill.dataset.status=value||'';
  return pill;
}
async function api(path='',options={}){
  const response=await fetch(API+path,{credentials:'same-origin',cache:'no-store',
    headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},...options});
  const body=await response.json().catch(()=>null);
  if(response.status===401)throw new Error('LOGIN_REQUIRED');
  if(!response.ok||!body?.ok)throw new Error(body?.code||'REQUEST_FAILED');
  return body;
}
function clearLeadView(){
  state.selected=null;
  state.offset=0;
  state.busy=false;
  $('#leadDetail').hidden=true;
  $('#noSelection').hidden=false;
  for(const id of ['leadId','leadName','leadCreated','saveStatus','listSummary'])$('#'+id).textContent='';
  for(const id of ['contactInfo','configurationInfo','selectedOptions','quoteLines','propertyInfo','eventsList','leadsList'])$('#'+id).replaceChildren();
  $('#editAssignee').value='';
  $('#editNote').value='';
}
function showLogin(message=''){
  state.sessionEpoch++;
  clearLeadView();
  $('#loginView').hidden=false;$('#dashboard').hidden=true;$('#logoutButton').hidden=true;
  $('#loginError').textContent=message;
  $('#managerPassword').value='';
  $('#activeManager').hidden=true;
  $('#activeManager').textContent='';
}
function showDashboard(phone){
  state.sessionEpoch++;
  clearLeadView();
  $('#loginView').hidden=true;$('#dashboard').hidden=false;$('#logoutButton').hidden=false;
  $('#activeManager').textContent=phone||'';
  $('#activeManager').hidden=!phone;
}
function fail(error,target){
  if(error.message==='LOGIN_REQUIRED'){showLogin('Сеанс завершён. Войдите снова.');return;}
  if(target)target.textContent='Ошибка: '+({
    RATE_LIMITED:'слишком много попыток, подождите 15 минут',
    REQUEST_FAILED:'не удалось выполнить запрос',
    STORAGE_UNAVAILABLE:'временная ошибка хранения'
  }[error.message]||error.message);
}
function stats(raw){
  $('#countTotal').textContent=raw.total;
  $('#countNew').textContent=raw.byStatus.new||0;
  $('#countProgress').textContent=(raw.byStatus.in_progress||0)+(raw.byStatus.awaiting_customer||0);
  $('#countQuoted').textContent=raw.byStatus.quote_sent||0;
}
function renderList(data){
  stats(data.stats);
  const list=$('#leadsList');list.replaceChildren();
  $('#listSummary').textContent=data.total+' заявок найдено';
  for(const lead of data.leads){
    const detail=lead.detail;
    const b=el('button','lead-item');
    b.type='button';b.dataset.id=lead.id;
    b.setAttribute('aria-current',String(state.selected===lead.id));
    const top=el('div','lead-top');
    top.append(el('span','lead-id',lead.id),statusPill(lead.status));
    b.append(top,el('div','lead-site',lead.sourceSite==='quadro-ready'?'КВАДРО READY':'Гарант Бани'),el('div','lead-main',detail.name||'Без имени'),
      el('div','lead-sub',detail.phone+' · '+(channels[detail.contactChannel]||'Звонок')),
      el('div','lead-sub',detail.estimate?
        detail.estimate.modelName+' · '+displaySize(detail.estimate.sizeId)+' · '+money(detail.estimate.total):
        'Заказ обратного звонка'),
      el('div','lead-sub',date(lead.createdAt)+' · '+(lead.assignee||'Менеджер не назначен')));
    if(lead.notificationStatus==='failed')b.append(el('div','error','MAX не получил уведомление'));
    b.addEventListener('click',()=>loadDetail(lead.id));
    list.append(b);
  }
  if(!data.leads.length)list.append(el('p','muted','Заявок не найдено.'));
  $('#pageLabel').textContent=data.total?Math.floor(data.offset/data.limit)+1+' / '+Math.max(1,Math.ceil(data.total/data.limit)):'0 / 0';
  $('#previousButton').disabled=data.offset<=0;
  $('#nextButton').disabled=data.offset+data.leads.length>=data.total;
}
async function loadList(){
  if(state.busy)return;
  state.busy=true;
  const epoch=state.sessionEpoch;
  try{
    const query=new URLSearchParams({
      limit:String(state.limit),offset:String(state.offset),
      status:$('#statusFilter').value,q:$('#leadSearch').value.trim(),site:state.site
    });
    const data=await api('leads?'+query);
    if(epoch===state.sessionEpoch)renderList(data);
  }catch(error){if(epoch===state.sessionEpoch)fail(error,$('#listSummary'));}
  finally{if(epoch===state.sessionEpoch)state.busy=false;}
}
function renderDetail(record){
  $('#noSelection').hidden=true;$('#leadDetail').hidden=false;
  $('#leadId').textContent=record.id;
  const lead=record.detail;
  $('#leadName').textContent=lead.name||'Без имени';
  $('#leadCreated').textContent='Получена '+date(record.createdAt);
  $('#leadStatus').replaceWith(statusPill(record.status));
  const statusNode=$('.detail-title .status-pill');statusNode.id='leadStatus';
  const dl=$('#contactInfo');dl.replaceChildren();
  pair(dl,'Имя',lead.name);
  pair(dl,'Телефон',lead.phone);
  pair(dl,'Связаться',channels[lead.contactChannel]||'Звонок');
  pair(dl,'Источник заявки',record.sourceSite==='quadro-ready'?'КВАДРО READY':'Гарант Бани');
  pair(dl,'Тип заявки',record.flow==='quote'?'Получить расчёт':'Перезвоните мне');
  pair(dl,'Сообщение в MAX',record.notificationStatus==='delivered'?'Доставлено':record.notificationStatus==='failed'?'Не доставлено; заявка сохранена':'Ожидается отправка');
  pair(dl,'Комментарий',lead.comment);
  $('#notificationRetryBlock').hidden=record.notificationStatus!=='failed';
  $('#retryMaxStatus').textContent='';
  const conf=$('#configurationBlock');
  const property=$('#propertyBlock');
  conf.hidden=!lead.estimate;property.hidden=!lead.estimate;
  if(lead.estimate){
    const q=lead.estimate,configuration=lead.configuration||{};
    const cd=$('#configurationInfo');cd.replaceChildren();
    pair(cd,'Модель',q.modelName);
    if(record.sourceSite==='quadro-ready'){
      pair(cd,'Артикул',q.sku);
      pair(cd,'Комплектация','READY — фиксированная');
      pair(cd,'Ширина',q.widthMeters+' м');
    }
    pair(cd,'Размер',displaySize(q.sizeId));
    pair(cd,'Отделка',configuration.finishName||'Не указана');
    pair(cd,'Цвет кровли',configuration.roofName||'Не указан');
    pair(cd,'Комплект',q.bundleApplied?'Применён комплект':configuration.bundleId?'Не применён':'Без комплекта');
    pair(cd,'Версия прайса',q.pricebookVersion+' · '+(q.pricebookStatus==='PROVISIONAL'?'ПРОЕКТНАЯ ЦЕНА':q.pricebookStatus==='DEMO_ONLY'?'демоцены':'по прайсу'));
    if(record.sourceSite==='quadro-ready')pair(cd,'Фундамент','Не входит; бесплатная консультация');
    const options=$('#selectedOptions');options.replaceChildren();
    for(const item of q.options){
      const row=el('div','option-row');
      row.append(el('span','',item.name),el('b','',money(item.price)));
      options.append(row);
    }
    if(!q.options.length)options.append(el('p','muted','Дополнительные опции не выбраны.'));
    const lines=$('#quoteLines');lines.replaceChildren();
    const quoteRows=record.sourceSite==='quadro-ready'?
      [['КВАДРО READY',q.total,'total']]:
      [['Стоимость модели',q.basePrice,''],
       ['Опции ('+q.options.length+')',q.optionsSubtotal,''],
       ['Скидка',-q.discount,''],
       ['Предварительно',q.total,'total']];
    for(const [label,value,cls]of quoteRows){
      const row=el('div','quote-line '+cls);
      row.append(el('span','',label),el('strong','',(value<0?'−':'')+money(Math.abs(value))));
      lines.append(row);
    }
    lines.append(el('small','muted',record.sourceSite==='quadro-ready'?
      'Проектная цена, до утверждения производителем. Доставка рассчитывается отдельно. Фундамент не входит.':
      'Доставка, отделка и условия установки требуют отдельного согласования. Цена демонстрационная.'));
    const dd=$('#propertyInfo');dd.replaceChildren();
    pair(dd,'Район доставки',lead.district);
    pair(dd,'Основание',bases[lead.base]||lead.base);
    pair(dd,'Подъезд',access[lead.access]||lead.access);
    if(record.sourceSite==='quadro-ready'){
      pair(dd,'Доставка','Стоимость будет уточнена менеджером');
      pair(dd,'Источник рекламы',lead.tracking?.utmSource||'—');
      pair(dd,'Кампания',lead.tracking?.utmCampaign||'—');
    }
  }
  $('#editStatus').value=record.status;
  $('#editAssignee').value=record.assignee||'';
  $('#editNote').value=record.managerNote||'';
  $('#saveStatus').textContent='';
  const history=$('#eventsList');history.replaceChildren();
  for(const event of record.events){
    const item=el('li');
    item.append(el('span','',event.detail||event.action),el('time','event-date',date(event.at)+' · '+(event.actor==='system'?'Система':event.actor||'Менеджер')));
    history.append(item);
  }
  for(const row of document.querySelectorAll('.lead-item'))row.setAttribute('aria-current',String(row.dataset.id===record.id));
  if(window.matchMedia('(max-width:690px)').matches){
    $('.detail-pane').scrollIntoView({behavior:'smooth',block:'start'});
  }
}
async function loadDetail(id){
  const epoch=state.sessionEpoch;
  try{
    const data=await api('leads/'+encodeURIComponent(id));
    if(epoch!==state.sessionEpoch||$('#dashboard').hidden)return;
    state.selected=id;
    renderDetail(data.lead);
  }catch(error){if(epoch===state.sessionEpoch)fail(error,$('#listSummary'));}
}
async function login(event){
  event.preventDefault();
  const button=$('#loginButton');button.disabled=true;
  $('#loginError').textContent='';
  try{
    const session=await api('login',{method:'POST',body:JSON.stringify({phone:$('#managerPhone').value,password:$('#managerPassword').value})});
    $('#managerPassword').value='';
    showDashboard(session.phone);
    await loadList();
  }catch(error){if(error.message==='LOGIN_REQUIRED')showLogin('Пароль неверный или доступ ограничен.');else fail(error,$('#loginError'));}
  finally{button.disabled=false;}
}
async function save(event){
  event.preventDefault();
  if(!state.selected)return;
  const epoch=state.sessionEpoch;
  const selectedId=state.selected;
  const button=$('#saveButton');button.disabled=true;
  $('#saveStatus').textContent='Сохраняем…';
  try{
    const payload={status:$('#editStatus').value,assignee:$('#editAssignee').value,managerNote:$('#editNote').value};
    const response=await api('leads/'+encodeURIComponent(selectedId),{method:'PATCH',body:JSON.stringify(payload)});
    if(epoch!==state.sessionEpoch)return;
    renderDetail(response.lead);
    $('#saveStatus').textContent='Изменения сохранены.';
    await loadList();
  }catch(error){if(epoch===state.sessionEpoch)fail(error,$('#saveStatus'));}
  finally{button.disabled=false;}
}
document.querySelectorAll('#siteTabs .site-tab').forEach(button=>button.addEventListener('click',()=>{
  state.site=button.dataset.site;
  state.offset=0;
  document.querySelectorAll('#siteTabs .site-tab').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  $('#leadDetail').hidden=true;
  $('#noSelection').hidden=false;
  state.selected=null;
  loadList();
}));
$('#retryMaxButton').addEventListener('click',async()=>{
  if(!state.selected||!confirm('Вы проверили, что заявка ещё не появилась в группе MAX? Повтор может доставить уведомление второй раз.'))return;
  const id=state.selected,button=$('#retryMaxButton');
  button.disabled=true;$('#retryMaxStatus').textContent='Отправляем…';
  try{
    await api('leads/'+encodeURIComponent(id)+'/retry-max',{method:'POST',body:'{}'});
    $('#retryMaxStatus').textContent='Уведомление доставлено в MAX.';
    await loadDetail(id);
    await loadList();
  }catch(error){fail(error,$('#retryMaxStatus'));}
  finally{button.disabled=false;}
});
$('#loginForm').addEventListener('submit',login);
$('#leadEditForm').addEventListener('submit',save);
$('#filterForm').addEventListener('submit',event=>{event.preventDefault();state.offset=0;loadList();});
$('#refreshButton').addEventListener('click',()=>loadList());
$('#previousButton').addEventListener('click',()=>{state.offset=Math.max(0,state.offset-state.limit);loadList();});
$('#nextButton').addEventListener('click',()=>{state.offset+=state.limit;loadList();});
$('#logoutButton').addEventListener('click',async()=>{
  try{await api('logout',{method:'POST'});}catch{}
  showLogin('');
});
api('session').then(async session=>{showDashboard(session.phone);await loadList();})
  .catch(()=>showLogin());
