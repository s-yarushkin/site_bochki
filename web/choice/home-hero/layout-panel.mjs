import {renderLayoutOverview} from './layout-story.mjs';
import {specification} from '/home-hero/layout-panel.mjs?v=album-22-20261105';
const base = '/home-hero/layouts/';
function assetPath(plan,key){return plan[key]+'?v='+encodeURIComponent((plan.sha256??'').slice(0,16));}
export async function layoutJson(path, signal = AbortSignal.timeout(10000)){
  const response = await fetch(base+path,{signal,cache:'no-cache'});
  if(!response.ok) throw Error('LAYOUT_UNAVAILABLE');
  return response.json();
}

function element(tag,text){
  const node = document.createElement(tag);
  if(text) node.textContent = text;
  return node;
}

function appendCostAction(dialog,plan,opener,onRequest){
  if(!onRequest)return;
  const footer=element('footer');footer.className='hh-layout-cost';
  const code=element('span','Планировка '+plan.id.toUpperCase());
  const request=element('button','Узнать стоимость этой планировки');
  request.type='button';request.className='choice-primary';request.dataset.layoutCost=plan.id;
  request.addEventListener('click',()=>{dialog.close();onRequest(opener,plan);});
  footer.append(code,request);dialog.append(footer);
}

function openSpecification(plan,opener,onRequest){
  document.dispatchEvent(new CustomEvent('dachapar:event',{detail:{name:'dp_plan_view',params:{plan_id:plan.id}}}));
  const dialog = element('dialog');
  dialog.dataset.layoutId = plan.id;
  dialog.className = 'hh-layout-dialog hh-layout-compact hh-layout-plan-dialog';
  dialog.setAttribute('aria-labelledby','hh-layout-spec-title');
  const header = element('header');
  const title = element('h2','Планировка '+plan.label);
  title.id = 'hh-layout-spec-title';
  const close = element('button','Закрыть ×');
  close.type = 'button';
  close.addEventListener('click',()=>dialog.close());
  header.append(title,close);
  const tabs=element('div');tabs.className='hh-layout-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Просмотр планировки');
  const planTab=element('button','Планировка'),specTab=element('button','Спецификация');
  for(const [tab,id,target]of [[planTab,'hh-layout-plan-tab','hh-layout-plan-content'],[specTab,'hh-layout-spec-tab','hh-layout-spec-content']]){
    tab.type='button';tab.id=id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',target);tabs.append(tab);
  }
  const drawing = element('img');
  drawing.alt = 'Планировка · '+plan.label;
  drawing.src = base+assetPath(plan,'drawing');
  const view=element('div');view.className='hh-plan-view';
  view.id='hh-layout-plan-content';view.setAttribute('role','tabpanel');view.setAttribute('aria-labelledby',planTab.id);
  const tools=element('div');tools.className='hh-plan-tools';
  const smaller=element('button','−'),larger=element('button','+'),hint=element('span','Рассмотрите план крупнее');
  smaller.type=larger.type='button';smaller.setAttribute('aria-label','Уменьшить план');larger.setAttribute('aria-label','Увеличить план');
  const viewport=element('div');viewport.className='hh-plan-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label','План бани с увеличением');viewport.append(drawing);
  let scale=1;function zoom(delta){scale=Math.min(4,Math.max(1,scale+delta));drawing.style.width=(scale*100)+'%';drawing.style.height=(scale*100)+'%';viewport.classList.toggle('is-zoomed',scale>1);smaller.disabled=scale===1;larger.disabled=scale===4;if(scale===1){viewport.scrollTop=0;viewport.scrollLeft=0;}}
  smaller.addEventListener('click',()=>zoom(-.5));larger.addEventListener('click',()=>zoom(.5));zoom(0);
  tools.append(smaller,larger,hint);view.append(tools,viewport);
  const body = element('div');
  body.className = 'hh-layout-spec';
  body.id='hh-layout-spec-content';body.setAttribute('role','tabpanel');body.setAttribute('aria-labelledby',specTab.id);body.tabIndex=0;
  body.append(element('p','Загружаем описание планировки…'));
  body.setAttribute('aria-live','polite');
  dialog.append(header,tabs,view,body);
  appendCostAction(dialog,plan,opener,onRequest);
  const controller = new AbortController();
  let specsLoaded=false;
  function selectTab(specs,focus=false){
    view.hidden=specs;body.hidden=!specs;
    for(const [tab,active]of [[planTab,!specs],[specTab,specs]]){tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    if(focus)(specs?specTab:planTab).focus();
    if(specs&&!specsLoaded){specsLoaded=true;loadSpecification();}
  }
  planTab.addEventListener('click',()=>selectTab(false));specTab.addEventListener('click',()=>selectTab(true));
  tabs.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();selectTab(event.key==='End'||event.key!=='Home'&&view.hidden===false,true);}});
  selectTab(false);
  dialog.addEventListener('close',()=>{
    controller.abort();
    dialog.remove();
    if(opener.getClientRects().length) opener.focus({preventScroll:true});
  },{once:true});
  document.body.append(dialog);
  dialog.showModal();
  function loadSpecification(){layoutJson(assetPath(plan,'spec'),AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]))
    .then(spec=>{if(dialog.open){
      body.replaceChildren(renderLayoutOverview(spec));
      const details=element('details');details.className='hh-full-specification';
      details.append(element('summary','Размеры и полная спецификация'),specification(spec));
      body.append(details);
    }})
    .catch(()=>{if(dialog.open){specsLoaded=false;body.replaceChildren(element('p','Описание временно недоступно. План можно посмотреть на соседней вкладке.'));}});}
}

function openViewer(plan, opener,onRequest){
  document.dispatchEvent(new CustomEvent('dachapar:event',{detail:{name:'dp_3d_open',params:{plan_id:plan.id}}}));
  const dialog = element('dialog');
  dialog.dataset.layoutId = plan.id;
  dialog.className = 'hh-layout-dialog hh-layout-3d-dialog hh-layout-compact';
  dialog.setAttribute('aria-label','3D-планировка '+plan.label);
  dialog.innerHTML = `
    <header><h2></h2><button type="button" data-close>Закрыть ×</button></header>
    <div class="hh-layout-stage">
      <canvas tabindex="0" aria-label="3D-планировка. Вращайте стрелками или перетаскиванием"></canvas>
      <p class="hh-layout-status" role="status">Загружаем 3D…</p>
      <p class="hh-layout-hint">Потяните, чтобы повернуть. Приближайте колёсиком, кнопками или двумя пальцами.</p>
      <div class="hh-layout-tools" hidden>
        <button type="button" data-layout-zoom-out aria-label="Отдалить">−</button>
        <button type="button" data-layout-zoom-in aria-label="Приблизить">+</button>
        <button type="button" data-layout-bench aria-pressed="false" hidden>Задвинуть нижний полок</button>
        <label class="hh-layout-doors" data-layout-door-control hidden>Двери
          <input type="range" min="0" max="100" step="1" value="100" data-layout-doors aria-label="Открытие дверей">
          <output data-layout-doors-state>открыты</output>
        </label>
        <button type="button" data-layout-reset>Исходный вид</button>
      </div>
    </div>`;
  dialog.querySelector('h2').textContent = '3D · '+plan.label;
  appendCostAction(dialog,plan,opener,onRequest);
  const stage = dialog.querySelector('.hh-layout-stage');
  const status = stage.querySelector('[role="status"]');
  const controller = new AbortController();
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
    document.dispatchEvent(new CustomEvent('dachapar:event',{detail:{name:'dp_3d_close',params:{plan_id:plan.id}}}));
    controller.abort();
    dialog.remove();
    if(opener.getClientRects().length) opener.focus({preventScroll:true});
  },{once:true});
  document.body.append(dialog);
  dialog.showModal();
  import('/home-hero/layout-viewer.mjs?v=colors-20261106').then(({mountLayoutViewer})=>
    mountLayoutViewer(stage,base+assetPath(plan,'model'),controller.signal)
  ).then(()=>{
    if(!dialog.open) return;
    stage.querySelector('.hh-layout-tools').hidden = false;
    status.textContent = '';
  }).catch(()=>{
    if(!dialog.open) return;
    stage.querySelector('canvas').hidden = true;
    stage.querySelector('.hh-layout-hint').hidden = true;
    const image = element('img');
    image.src = base+assetPath(plan,'preview');
    image.alt = '3D-ракурс · '+plan.label;
    stage.prepend(image);
    status.textContent = 'Интерактивный просмотр сейчас недоступен.';
  });
}

export function createLayoutPanel(container,{onRequest}={}){
  container.innerHTML = `
    <button type="button" class="hh-layout-tile" data-drawing>
      <img alt=""><span>Посмотреть план крупнее ↗</span>
    </button>
    <button type="button" class="hh-layout-tile" data-preview>
      <img alt=""><span>Рассмотреть в 3D ↗</span>
    </button>`;
  const drawing = container.querySelector('[data-drawing]');
  const preview = container.querySelector('[data-preview]');
  let plan;
  drawing.addEventListener('click',()=>openSpecification(plan,drawing,onRequest));
  preview.addEventListener('click',()=>openViewer(plan,preview,onRequest));
  return next=>{
    plan = next;
    container.hidden = !plan;
    if(!plan) return;
    for(const [button,path,label] of [[drawing,plan.drawing,'Чертёж'],[preview,plan.preview,'3D-ракурс']]){
      const image = button.querySelector('img');
      image.alt = label+' · '+plan.label;
      image.src = base+path+'?v='+encodeURIComponent((plan.sha256??'').slice(0,16));
    }
  };
}

export function createLayoutGallery(container,plans,options={}){
  container.hidden = plans.length === 0;
  container.replaceChildren();
  for(const plan of plans){
    const card = element('article');
    card.className = 'hh-layout-example';
    card.dataset.layoutExample = plan.id;
    const heading = element('h4','Пример '+plan.label);
    const tiles = element('div');
    tiles.className = 'hh-layout-panel';
    card.append(heading,tiles);
    container.append(card);
    createLayoutPanel(tiles,options)(plan);
  }
}
