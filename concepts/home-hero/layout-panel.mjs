import {renderLayoutOverview} from './layout-story.mjs';
const base = '/home-hero/layouts/';
export async function layoutJson(path, signal = AbortSignal.timeout(10000)){
  const response = await fetch(base+path,{signal});
  if(!response.ok) throw Error('LAYOUT_UNAVAILABLE');
  return response.json();
}

function element(tag,text){
  const node = document.createElement(tag);
  if(text) node.textContent = text;
  return node;
}

function openSpecification(plan,opener,onRequest){
  const dialog = element('dialog');
  dialog.dataset.layoutId = plan.id;
  dialog.className = 'hh-layout-dialog';
  dialog.setAttribute('aria-labelledby','hh-layout-spec-title');
  const header = element('header');
  const title = element('h2','Планировка '+plan.label);
  title.id = 'hh-layout-spec-title';
  const close = element('button','Закрыть ×');
  close.type = 'button';
  close.addEventListener('click',()=>dialog.close());
  header.append(title,close);
  const drawing = element('img');
  drawing.alt = 'Планировка · '+plan.label;
  drawing.src = base+plan.drawing;
  const view=element('div');view.className='hh-plan-view';
  const tools=element('div');tools.className='hh-plan-tools';
  const smaller=element('button','−'),larger=element('button','+'),hint=element('span','Рассмотрите план крупнее');
  smaller.type=larger.type='button';smaller.setAttribute('aria-label','Уменьшить план');larger.setAttribute('aria-label','Увеличить план');
  const viewport=element('div');viewport.className='hh-plan-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label','План бани с увеличением');viewport.append(drawing);
  let scale=1;function zoom(delta){scale=Math.min(4,Math.max(1,scale+delta));drawing.style.width=(scale*100)+'%';viewport.classList.toggle('is-zoomed',scale>1);smaller.disabled=scale===1;larger.disabled=scale===4;}
  smaller.addEventListener('click',()=>zoom(-.5));larger.addEventListener('click',()=>zoom(.5));zoom(0);
  tools.append(smaller,larger,hint);view.append(tools,viewport);
  const body = element('div');
  body.className = 'hh-layout-spec';
  body.append(element('p','Загружаем описание планировки…'));
  body.setAttribute('aria-live','polite');
  dialog.append(header,view,body);
  const controller = new AbortController();
  dialog.addEventListener('close',()=>{
    controller.abort();
    dialog.remove();
    if(opener.getClientRects().length) opener.focus({preventScroll:true});
  },{once:true});
  document.body.append(dialog);
  dialog.showModal();
  layoutJson(plan.spec,AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]))
    .then(spec=>{if(dialog.open){
      body.replaceChildren(renderLayoutOverview(spec));
      if(onRequest){const request=element('button','Запросить цену этой планировки и комплектации ↗');request.type='button';request.className='choice-primary';request.addEventListener('click',()=>{dialog.close();onRequest(opener);});body.querySelector('.hh-plan-overview').append(request);}
    }})
    .catch(()=>{if(dialog.open) body.replaceChildren(element('p','Описание временно недоступно. План можно посмотреть выше.'));});
}

function openViewer(plan, opener){
  const dialog = element('dialog');
  dialog.dataset.layoutId = plan.id;
  dialog.className = 'hh-layout-dialog hh-layout-3d-dialog';
  dialog.setAttribute('aria-label','3D-планировка '+plan.label);
  dialog.innerHTML = `
    <header><h2></h2><button type="button" data-close>Закрыть ×</button></header>
    <div class="hh-layout-stage">
      <canvas tabindex="0" aria-label="3D-планировка. Вращайте стрелками или перетаскиванием"></canvas>
      <p class="hh-layout-status" role="status">Загружаем 3D…</p>
      <p class="hh-layout-hint">Потяните, чтобы повернуть. Приближайте кнопками или двумя пальцами.</p>
      <div class="hh-layout-tools" hidden>
        <button type="button" data-layout-zoom-out aria-label="Отдалить">−</button>
        <button type="button" data-layout-zoom-in aria-label="Приблизить">+</button>
        <button type="button" data-layout-reset>Исходный вид</button>
        <button type="button" data-layout-slide hidden>Задвинуть полок</button>
      </div>
    </div>`;
  dialog.querySelector('h2').textContent = '3D · '+plan.label;
  const stage = dialog.querySelector('.hh-layout-stage');
  const status = stage.querySelector('[role="status"]');
  const controller = new AbortController();
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
    controller.abort();
    dialog.remove();
    if(opener.getClientRects().length) opener.focus({preventScroll:true});
  },{once:true});
  document.body.append(dialog);
  dialog.showModal();
  import('./layout-viewer.mjs').then(({mountLayoutViewer})=>
    mountLayoutViewer(stage,base+plan.model,controller.signal)
  ).then(()=>{
    if(!dialog.open) return;
    stage.querySelector('.hh-layout-tools').hidden = false;
    status.textContent = '';
  }).catch(()=>{
    if(!dialog.open) return;
    stage.querySelector('canvas').hidden = true;
    stage.querySelector('.hh-layout-hint').hidden = true;
    const image = element('img');
    image.src = base+plan.preview;
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
  preview.addEventListener('click',()=>openViewer(plan,preview));
  return next=>{
    plan = next;
    container.hidden = !plan;
    if(!plan) return;
    for(const [button,path,label] of [[drawing,plan.drawing,'Чертёж'],[preview,plan.preview,'3D-ракурс']]){
      const image = button.querySelector('img');
      image.alt = label+' · '+plan.label;
      image.src = base+path;
    }
  };
}

export function createLayoutGallery(container,plans){
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
    createLayoutPanel(tiles)(plan);
  }
}
