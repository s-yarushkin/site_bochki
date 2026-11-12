const $=s=>document.querySelector(s),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const options=(select,rows)=>{select.replaceChildren(...rows.map(([value,label,disabled])=>{const o=node('option',label);o.value=value;o.disabled=Boolean(disabled);return o;}));};
const field=(label,control)=>{const l=node('label',label);l.append(control);return l;};
const input=(id,max=100,type='text')=>{const e=node('input');e.id=id;e.maxLength=max;e.type=type;return e;};
const select=id=>{const e=node('select');e.id=id;return e;};
const date=value=>value?new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'}).format(new Date(value)):'';
const dateInput=value=>{if(!value)return '';const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));return parts.replace(' ','T');};
const modelNames={kvadro:'Квадро',parus:'Парус',viking:'Викинг','kvadro-house':'Квадро Хаус'};
const sourceNames={yandex:'Яндекс',google:'Google',vk:'ВКонтакте',youtube:'YouTube',telegram:'Telegram',max:'MAX',partner:'Партнёр',offline:'Офлайн / QR',direct:'Прямой',unknown:'Не определён',other:'Другой'};
const kinds={note:'Заметка',message_in:'Сообщение клиента',message_out:'Наш ответ',call:'Звонок',meeting:'Встреча'};
const channelNames={none:'Без канала',phone:'Телефон',max:'MAX',telegram:'Telegram',whatsapp:'WhatsApp',other:'Другой'};
const statuses={new:'Новая',in_progress:'В работе',awaiting_customer:'Ждём клиента',quote_sent:'КП отправлено',won:'Продано',lost:'Закрыто без продажи'};
const errorText=e=>({LEAD_CONFLICT:'Карточка изменена другим менеджером. Скопируйте свои правки и обновите карточку.',ACTIVITY_CONFLICT:'Эта запись уже сохранена с другими данными. Обновите карточку.',TEST_LEAD_READ_ONLY:'Тестовая заявка доступна только для чтения.',INVALID_ASSIGNEE:'Выберите действующего менеджера из списка.',INVALID_DATE:'Проверьте дату и время.',INVALID_FILTER:'Проверьте значения фильтров.',FORBIDDEN:'Недостаточно прав.',CSRF_INVALID:'Обновите страницу и повторите действие.'}[e.message]??'Не удалось сохранить. Попробуйте ещё раз.');

export function mountLeadWorkspace({api,refreshList,openLead}){
 let user=null,current=null,directory=[],epoch=0,pending=Promise.resolve(),entryId=null,posting=false,more=false;const drafts=new Map();
 const edit=$('#leadEditForm'),assignment=$('#editAssignee'),name=input('editCustomerName',80),settlement=input('editSettlement',140),region=input('editRegion',100),followUp=input('editFollowUp',100,'datetime-local');
 settlement.autocomplete='address-level2';region.autocomplete='address-level1';name.autocomplete='name';
 edit.prepend(field('Имя клиента',name),field('Населённый пункт',settlement),field('Регион',region),field('Следующий контакт, МСК',followUp));
 const productSummary=node('p',undefined,'lead-product-summary');$('#contactBlock').append(productSummary);
 const regionList=node('datalist');regionList.id='crmRegions';region.setAttribute('list',regionList.id);edit.append(regionList);
 const work=edit.closest('.detail-block');work.id='leadWorkBlock';
 const original=node('details',undefined,'lead-original');original.id='leadOriginalDetails';original.append(node('summary','Источник, исходная заявка и системная история'));
 const originalContact=node('section',undefined,'detail-block'),originalInfo=node('dl');originalInfo.id='originalContactInfo';originalContact.append(node('h3','Первичная заявка'),originalInfo);
 const eventsBlock=$('#eventsList').closest('.detail-block');original.append(originalContact,$('#configurationBlock'),$('#propertyBlock'),eventsBlock);
 const journal=node('section',undefined,'detail-block lead-journal');journal.id='leadJournal';journal.append(node('h3','Журнал контактов и заметок'));
 const note=node('p','Записи сохраняются в карточке. Сообщения клиенту отсюда не отправляются.','muted fine');
 const form=node('form',undefined,'journal-form'),kind=select('journalKind'),channel=select('journalChannel'),body=node('textarea'),save=node('button','Добавить запись','btn primary'),status=node('p',undefined,'muted fine');
 body.rows=3;body.maxLength=6000;body.required=true;body.placeholder='Итог звонка, текст переписки, договорённости или следующий шаг';body.id='journalBody';status.role='status';
 options(kind,Object.entries(kinds));options(channel,Object.entries(channelNames));save.type='submit';
 form.append(field('Тип записи',kind),field('Канал',channel),field('Текст записи',body),save,status);
 const feed=node('ol',undefined,'journal-feed'),older=node('button','Показать более ранние записи','btn outline');older.type='button';older.hidden=true;
 journal.append(note,form,feed,older);$('#contactBlock').after(work,journal,original);
 const resetDraft=()=>{if(!current)return;entryId=null;drafts.set(current.id,{body:body.value,kind:kind.value,channel:channel.value});};
 form.addEventListener('input',resetDraft);form.addEventListener('change',resetDraft);
 kind.addEventListener('change',()=>{if(kind.value==='call')channel.value='phone';else if(kind.value==='note')channel.value='none';resetDraft();});
 const filters=$('#filterForm'),manager=select('assigneeFilter');manager.name='assignee';
 filters.insertBefore(field('Менеджер',manager),filters.querySelector('button[type=submit]'));
 const advanced=node('details',undefined,'lead-advanced'),advancedGrid=node('div',undefined,'lead-filter-grid');advanced.append(node('summary','Дополнительные фильтры'),advancedGrid);
 const filterControls={assignee:manager},makeFilter=(key,label,control)=>{control.name=key;control.id='leadFilter-'+key;filterControls[key]=control;advancedGrid.append(field(label,control));return control;};
 const model=makeFilter('model','Модель',select('modelFilter'));options(model,[['','Все модели'],...Object.entries(modelNames)]);
 const filterRegion=makeFilter('region','Регион',input('regionFilter',100)),filterCity=makeFilter('settlement','Населённый пункт',input('settlementFilter',140));
 filterRegion.setAttribute('list',regionList.id);const cities=node('datalist');cities.id='crmSettlements';filterCity.setAttribute('list',cities.id);filters.append(cities);
 const sources=makeFilter('source','Откуда пришла заявка',select('sourceFilter'));
 const traffic=makeFilter('channel','Тип перехода',select('trafficFilter'));options(traffic,[['','Все переходы'],['paid','Реклама'],['search_organic','Поиск'],['social_organic','Соцсети'],['messenger','Мессенджеры'],['partner_referral','Партнёры'],['direct','Прямой'],['other_referral','Другие сайты'],['unknown','Не определён']]);
 makeFilter('campaign','Кампания / публикация',input('campaignFilter',100));makeFilter('landing','Страница входа',input('landingFilter',120));
 const entry=makeFilter('entry','Источник формы',select('entryFilter'));options(entry,[['','Любая форма'],['model_offer','Карточка модели'],['plan_request','Конкретная планировка'],['quiz','Квиз'],['header_callback','Шапка сайта'],['site_capture','Общая форма'],['footer_capture','Низ сайта'],['capture_bar','Закреплённая форма'],['calculator','Расчёт'],['unknown','Не определено']]);
 makeFilter('from','Получены с, МСК',input('fromFilter',20,'date'));makeFilter('to','Получены по, МСК',input('toFilter',20,'date'));
 const overdue=makeFilter('overdue','Следующий контакт',select('overdueFilter'));options(overdue,[['','Все заявки'],['1','Контакт просрочен']]);
 const reset=node('button','Сбросить фильтры','btn subtle');reset.type='button';reset.addEventListener('click',()=>{$('#leadSearch').value='';$('#statusFilter').value='all';$('#classificationFilter').value='real';for(const e of Object.values(filterControls))e.value='';refreshList();});
 filters.append(advanced,reset);$('#leadSearch').maxLength=200;$('#leadSearch').placeholder='Имя, телефон, город, слова в переписке';
 function updateDirectory(){options(manager,[['','Все менеджеры'],['none','Не назначен'],...directory.map(u=>[u.id,u.name+(u.active?'':' · доступ выключен')])]);}
 function renderActivity(activity){
  const system=(current?.events??[]).filter(e=>e.action!=='contact_recorded').map(e=>({system:true,id:'event-'+e.seq,at:e.at,actor:e.actorName??(e.actor==='system'?'Система':'Сотрудник'),body:e.action==='status'?e.detail.split(' → ').map(v=>statuses[v]??v).join(' → '):e.detail}));
  const manual=(activity?.entries??[]).map(e=>({...e,at:e.occurred_at,actor:e.actorName}));
  feed.replaceChildren(...[...manual,...system].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).map(e=>{
   const item=node('li',undefined,'journal-entry '+(e.system?'is-system':'kind-'+e.kind)),heading=node('div',undefined,'journal-entry-heading');
   heading.append(node('strong',e.system?'Действие':kinds[e.kind]),node('span',e.actor+' · '+date(e.at)));
   item.append(heading);if(!e.system&&e.channel!=='none')item.append(node('small',channelNames[e.channel]));
   item.append(node('p',e.body));return item;
  }));
  older.hidden=!activity||activity.entries.length>=activity.total;older.disabled=more;
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(posting||!current||!body.value.trim())return;
  const id=current.id,token=epoch;posting=true;save.disabled=true;status.textContent='Сохраняем…';
  const payload={clientId:entryId??=crypto.randomUUID(),kind:kind.value,channel:channel.value,body:body.value};
  try{
   const result=await api('leads/'+id+'/activity',{method:'POST',body:JSON.stringify(payload)});
   if(token!==epoch||current?.id!==id)return;current.activity=result.activity;drafts.delete(id);body.value='';entryId=null;status.textContent='Запись сохранена.';renderActivity(result.activity);await refreshList();
  }catch(e){if(token===epoch&&current?.id===id)status.textContent=errorText(e);}
  finally{posting=false;save.disabled=false;}
 });
 older.addEventListener('click',async()=>{
  if(more||!current)return;more=true;older.disabled=true;const id=current.id,token=epoch;
  try{const next=await api('leads/'+id+'/activity?offset='+current.activity.entries.length);if(token!==epoch||current?.id!==id)return;current.activity={...next.activity,entries:[...current.activity.entries,...next.activity.entries]};renderActivity(current.activity);}
  catch(e){status.textContent=errorText(e);}finally{more=false;older.disabled=false;}
 });
 return {
  session(session){
   const token=++epoch;user=session?.user;directory=[];current=null;assignment.disabled=true;
   if(!user||user.must_change_password||!user.permissions.includes('view_all_leads')){pending=Promise.resolve();return;}
   pending=api('lead-options').then(data=>{if(token!==epoch)return;directory=data.assignees;updateDirectory();const values=[...new Set(['Вологодская область','Ярославская область','Московская область','Ленинградская область','Москва','Санкт-Петербург',...data.regions])].sort((a,b)=>a.localeCompare(b,'ru'));regionList.replaceChildren(...values.map(v=>{const e=node('option');e.value=v;return e;}));cities.replaceChildren(...data.settlements.map(v=>{const e=node('option');e.value=v;return e;}));options(sources,[['','Все источники'],...[...new Set([...Object.keys(sourceNames),...data.sources])].map(v=>[v,sourceNames[v]??v])]);assignment.disabled=false;}).catch(()=>{if(token===epoch)$('#listSummary').textContent='Список менеджеров пока недоступен. Обновите страницу.';});
  },
  ready:()=>pending,
  filters:()=>Object.fromEntries(Object.entries(filterControls).map(([key,e])=>[key,e.value])),
  errorText,
  render(record){
   const changed=current?.id!==record.id;current=record;
   const m=record.metadata??{},labels={explicit:'выбор клиента',request:'запрос из этой модели',link:'из ссылки',default:'модель стояла по умолчанию',restored:'ранее сохранённый вариант',unknown:'выбор не подтверждён'};
   const size=/^\d{3}$/.test(String(m.size))?(Number(m.size)/100).toLocaleString('ru-RU')+' м':String(m.size??'').replace('x','×');
   productSummary.textContent=m.model?[modelNames[m.model],size,m.package?({comfort:'Комфорт',deluxe:'Делюкс'}[m.package]??m.package):'',m.plan?.toUpperCase(),labels[m.modelSource]??labels.unknown].filter(Boolean).join(' · '):'Модель в заявке не указана';
   name.value=record.customer?.name??record.detail.name??'';settlement.value=record.customer?.settlement??record.detail.district??'';region.value=record.customer?.region??'';followUp.value=dateInput(record.followUpAt);
   const legacy=!record.assigneeUserId&&record.assigneeName;
   const retained=record.assigneeUserId&&!directory.some(u=>u.id===record.assigneeUserId);
   options(assignment,[['','Не назначен'],...(legacy?[['legacy',record.assigneeName+' · прежняя запись',true]]:[]),...(retained?[[record.assigneeUserId,record.assigneeName+' · прежний ответственный',true]]:[]),...directory.map(u=>[u.id,u.name,!u.active])]);assignment.value=record.assigneeUserId??(legacy?'legacy':'');
   const disabled=record.classification==='test'||!user?.permissions.includes('edit_leads');for(const e of form.elements)e.disabled=disabled;form.hidden=disabled;
   if(changed){const draft=drafts.get(record.id);body.value=draft?.body??'';kind.value=draft?.kind??'note';channel.value=draft?.channel??'none';entryId=null;status.textContent='';original.open=record.classification==='test';}
   const context=$('#crmLeadContext');if(context)original.prepend(context);renderActivity(record.activity);
  },
  payload(){const before=current?.assigneeUserId??(current?.assigneeName?'legacy':'');return {contactName:name.value,settlement:settlement.value,region:region.value,followUpAt:followUp.value?new Date(followUp.value+':00+03:00').toISOString():null,expectedVersion:current?.version??0,...(!assignment.disabled&&assignment.value!=='legacy'&&assignment.value!==before?{assigneeUserId:assignment.value||null}:{})};},
  clear(){++epoch;current=null;user=null;drafts.clear();body.value=name.value=settlement.value=region.value=followUp.value='';feed.replaceChildren();originalInfo.replaceChildren();status.textContent='';directory=[];entryId=null;}
 };
}
