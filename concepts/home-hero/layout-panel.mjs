const base = '/home-hero/layouts/';
const mm = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1});
const area = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2,minimumFractionDigits:2});
const roomNames = {steam:'Парная',lounge:'Комната отдыха',wash:'Помывочная',
  shower:'Душевая',wc:'Санузел',bedroom:'Спальня'};

export async function layoutJson(path, signal = AbortSignal.timeout(10000)){
  const response = await fetch(base+path,{signal,cache:'no-cache'});
  if(!response.ok) throw Error('LAYOUT_UNAVAILABLE');
  return response.json();
}

function assetPath(plan,key){
  return plan[key]+'?v='+encodeURIComponent((plan.sha256 ?? '').slice(0,16));
}

function element(tag,text){
  const node = document.createElement(tag);
  if(text) node.textContent = text;
  return node;
}

function table(title, headings, rows){
  const node = element('table');
  node.createCaption().textContent = title;
  const heading = node.createTHead().insertRow();
  for(const label of headings){
    const cell = element('th',label);
    cell.scope = 'col';
    heading.append(cell);
  }
  const body = node.createTBody();
  for(const row of rows){
    const entry = body.insertRow();
    for(const value of row) entry.insertCell().textContent = value;
  }
  return node;
}

export function specification(spec){
  const fragment = document.createDocumentFragment();
  const text = spec.public_specification;
  if(!text) throw Error('VERIFIED_SPECIFICATION_UNAVAILABLE');
  fragment.append(table('Помещения',['Помещение','Размеры','Площадь'],text.rooms.map(room=>[
    room.number+'. '+room.label,room.dimensions,room.area
  ])));
  fragment.append(table('Мебель, полки и оборудование',['На чертеже','Размеры'],text.items.map(item=>[
    item.code+' · '+item.label,item.dimensions
  ])));
  const openings = spec.items.filter(item=>['door','window'].includes(item.kind));
  if(openings.length) fragment.append(table('Двери и окна',['На чертеже','Ширина проёма'],openings.map(item=>[
    item.code+' · '+item.label,mm.format(item.opening_width_mm)+' мм'
  ])));
  return fragment;
}

function openSpecification(plan,opener){
  const dialog = element('dialog');
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
  drawing.alt = 'Размерный чертёж · '+plan.label;
  drawing.src = base+assetPath(plan,'drawing');
  const body = element('div');
  body.className = 'hh-layout-spec';
  body.append(element('p','Загружаем спецификацию…'));
  const code = element('p',plan.id.toUpperCase());
  code.className = 'hh-layout-code';
  body.setAttribute('aria-live','polite');
  dialog.append(header,drawing,code,body);
  const controller = new AbortController();
  dialog.addEventListener('close',()=>{
    controller.abort();
    dialog.remove();
    if(opener.getClientRects().length) opener.focus({preventScroll:true});
  },{once:true});
  document.body.append(dialog);
  dialog.showModal();
  layoutJson(assetPath(plan,'spec'),AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]))
    .then(spec=>{if(dialog.open) body.replaceChildren(specification(spec));})
    .catch(()=>{if(dialog.open) body.replaceChildren(element('p','Спецификация временно недоступна. Чертёж можно посмотреть выше.'));});
}

function openViewer(plan, opener){
  const dialog = element('dialog');
  dialog.className = 'hh-layout-dialog hh-layout-3d-dialog';
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

export function createLayoutPanel(container){
  container.innerHTML = `
    <button type="button" class="hh-layout-tile" data-drawing>
      <img alt=""><span>Чертёж и спецификация ↗</span>
    </button>
    <button type="button" class="hh-layout-tile" data-preview>
      <img alt=""><span>Открыть в 3D ↗</span>
    </button>`;
  const drawing = container.querySelector('[data-drawing]');
  const preview = container.querySelector('[data-preview]');
  let plan;
  drawing.addEventListener('click',()=>openSpecification(plan,drawing));
  preview.addEventListener('click',()=>openViewer(plan,preview));
  return next=>{
    if(next?.id === plan?.id && next) return;
    plan = next;
    container.hidden = !plan;
    if(!plan) return;
    for(const [button,path,label] of [[drawing,assetPath(plan,'drawing'),'Чертёж'],[preview,assetPath(plan,'preview'),'3D-ракурс']]){
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
