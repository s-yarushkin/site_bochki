import {HERO_MODELS} from './catalog.mjs';
import {openModelRequest} from './model-request.mjs';
import {createLayoutGallery,layoutJson} from './layout-panel.mjs';

const rubles = new Intl.NumberFormat('ru-RU', {style:'currency', currency:'RUB', maximumFractionDigits:0});

function route(hash, model, size){
  const url = new URL(location.href);
  url.hash = hash;
  if(model) url.searchParams.set('bath', model);
  else url.searchParams.delete('bath');
  if(size) url.searchParams.set('bathSize', size);
  else url.searchParams.delete('bathSize');
  return url;
}

function modelLink(id){
  const link = document.createElement('a');
  link.href = route('bath-model', id);
  link.dataset.bathLink = id;
  link.textContent = HERO_MODELS[id].name;
  return link;
}

export function mountModelJourney(pricebook){
  const catalog = document.querySelector('#models');
  const grid = catalog.querySelector('.model-grid');
  const cards = [...grid.querySelectorAll('[data-model-card]')];
  if(cards.length !== Object.keys(HERO_MODELS).length || cards.some(card=>!Object.hasOwn(HERO_MODELS,card.dataset.modelCard))) return;
  const heading = catalog.querySelector('.section-heading');
  const entry = catalog.querySelector('[data-quiz-mount]');
  const listNav = document.createElement('nav');
  listNav.className = 'hh-catalog-nav';
  listNav.setAttribute('aria-label','Навигация каталога');
  listNav.innerHTML = '<a href="#main" data-bath-route="main">↑ На первый экран</a>';
  heading.before(listNav);
  heading.querySelector('p').textContent = 'Выберите модель, чтобы посмотреть размеры, цены и планировки.';

  const descriptions = {};
  for(const card of cards){
    const id = card.dataset.modelCard;
    const figure = card.querySelector('img');
    const spec = card.querySelector('.model-head small');
    const desc = card.querySelector('.model-desc');
    const price = card.querySelector('[data-price]');
    const link = modelLink(id);
    const name = document.createElement('h3');
    name.textContent = link.textContent;
    descriptions[id] = {description:desc.textContent, figure:figure.cloneNode(true)};
    link.className = 'hh-catalog-card';
    price.removeAttribute('data-price');
    price.dataset.bathPrice = '';
    price.textContent = 'от ' + price.textContent;
    const content = document.createElement('div');
    const action = document.createElement('span');
    action.className = 'hh-catalog-action';
    action.textContent = 'Размеры и планировки →';
    content.append(name, spec, desc, price, action);
    link.replaceChildren(figure,content);
    card.replaceChildren(link);
  }

  const panel = document.createElement('section');
  panel.id = 'bath-model';
  panel.className = 'hh-bath-panel';
  panel.setAttribute('aria-labelledby','hh-bath-title');
  panel.hidden = true;
  panel.innerHTML = `
    <nav class="hh-catalog-nav" aria-label="Назад из модели">
      <a href="#models" data-bath-route="models">← Все модели</a>
      <a href="#main" data-bath-route="main">↑ На первый экран</a>
    </nav>
    <nav class="hh-bath-switch" aria-label="Переключить модель"></nav>
    <h2 id="hh-bath-title" tabindex="-1"></h2>
    <p class="hh-bath-description"></p>
    <div class="hh-bath-columns">
      <div class="hh-bath-photo"></div>
      <div class="hh-bath-options">
        <label class="hh-bath-size">Размер бани <select></select></label>
        <p class="hh-bath-prices" aria-live="polite"></p>

      </div>
      <div class="hh-bath-offer">
        <div><strong>Скидка 20 000 ₽ на «Делюкс»</strong>
        <p>Пришлём расширенную подборку планировок и комплектаций с ценами в удобный мессенджер.</p></div>
        <button class="btn" type="button">Получить планировки и цены</button>
      </div>
    </div>
    <section class="hh-bath-plan" aria-labelledby="hh-examples-title">
      <h3 id="hh-examples-title">Примеры планировок для этой бани</h3>
      <p class="hh-examples-note">Посмотрите разные варианты размещения помещений и мебели. У каждого примера свои габариты, указанные на чертеже. Размер для расчёта стоимости выбирается выше.</p>
      <div class="hh-layout-gallery"></div>
      <p class="hh-bath-plan-status" role="status"></p>
    </section>`;
  grid.after(panel);
  for(const link of document.querySelectorAll('footer a[href="/bani/"]')){
    link.href = '#models';
    link.dataset.bathRoute = 'models';
  }
  const find = selector=>panel.querySelector(selector);
  const title = find('h2');
  const switcher = find('.hh-bath-switch');
  switcher.append(...Object.keys(HERO_MODELS).map(modelLink));
  const sizePicker = find('.hh-bath-size select');
  const prices = find('.hh-bath-prices');
  const planStatus = find('.hh-bath-plan-status');
  let book, pricesUnavailable, layouts, planLoad, planError, shownPlans = [], current, size, lastCard;

  function drawExamples(){
    shownPlans = (layouts ?? []).filter(plan=>plan.models.includes(current));
    createLayoutGallery(find('.hh-layout-gallery'),shownPlans);
    planStatus.textContent = shownPlans.length ? '' : planError ?
      'Примеры сейчас недоступны. Попробуйте обновить страницу.' : layouts ?
      'Примеры планировок для этой модели готовятся.' : 'Загружаем примеры…';
  }

  function drawSize(){
    if(!size || !book) return;
    const row = book.r85.models[current].sizes[size];
    prices.replaceChildren();
    for(const [name, price] of [['Комфорт', row.priceRub], ['Делюкс', row.deluxe?.priceRub]]){
      if(!Number.isFinite(price)) continue;
      const line = document.createElement('span');
      line.textContent = name + ' · ' + rubles.format(price);
      prices.append(line);
    }
    const note = document.createElement('small');
    note.textContent = 'Цены за комплектации выбранного размера. Оснащение по чертежу и доставка рассчитываются отдельно.';
    prices.append(note);
  }

  function sync(){
    const url = new URL(location.href);
    const id = url.searchParams.get('bath');
    current = url.hash === '#bath-model' && Object.hasOwn(HERO_MODELS,id) ? id : null;
    panel.hidden = !current;
    grid.hidden = heading.hidden = listNav.hidden = Boolean(current);
    if(entry) entry.hidden = Boolean(current);
    if(!current){
      find('.hh-layout-gallery').replaceChildren();
      return;
    }
    title.textContent = HERO_MODELS[current].name;
    find('.hh-bath-description').textContent = descriptions[current].description;
    find('.hh-bath-photo').replaceChildren(descriptions[current].figure.cloneNode(true));
    for(const link of switcher.children){
      if(link.dataset.bathLink === current) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    }
    const sizes = book?.r85?.models[current]?.sizes;
    const requested = url.searchParams.get('bathSize');
    size = sizes && Object.hasOwn(sizes, requested) ? requested : Object.keys(sizes ?? {})[0];
    sizePicker.replaceChildren(...Object.entries(sizes ?? {}).map(([key,row])=>new Option(row.label,key)));
    sizePicker.disabled = !sizes;
    if(size) sizePicker.value = size;
    if(!sizes) prices.textContent = pricesUnavailable ? 'Цены сейчас недоступны. Пришлём их в подборке.' : 'Загружаем цены…';
    if(!planLoad){
      planLoad = layoutJson('index.json')
        .then(data=>{layouts=data.plans;})
        .catch(()=>{planError=true;})
        .finally(()=>{if(current) drawExamples();});
    }
    drawSize();
    drawExamples();
  }

  function move(hash, id){
    const next = route(hash, id);
    if(next.href !== location.href) history.pushState(history.state,'',next);
    sync();
    const target = hash === 'bath-model' ? panel : document.getElementById(hash);
    target.scrollIntoView({block:'start'});
    const focus = hash === 'bath-model' ? title :
      hash === 'models' ? lastCard ?? heading.querySelector('h2') : document.querySelector('#hh-heading');
    if(focus && !focus.matches('a,button')) focus.tabIndex = -1;
    focus?.focus({preventScroll:true});
  }

  document.addEventListener('click',event=>{
    const link = event.target.closest('[data-bath-link],[data-bath-route],#hh-plans');
    if(!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const id = link.dataset.bathLink;
    event.preventDefault();
    const menu = link.closest('#mobile-menu');
    if(menu){
      menu.hidden = true;
      document.querySelector('[aria-controls="mobile-menu"]').setAttribute('aria-expanded','false');
    }
    if(id){
      lastCard = grid.querySelector('[data-bath-link="'+id+'"]');
      if(id !== current) move('bath-model',id);
    }else move(link.dataset.bathRoute ?? 'models');
  });
  function changeSize(){
    size=sizePicker.value;
    history.replaceState(history.state,'',route('bath-model',current,size));
    drawSize();
  }
  sizePicker.addEventListener('change',changeSize);
  find('.hh-bath-offer button').addEventListener('click',event=>openModelRequest({
    name:HERO_MODELS[current].name,
    size:sizePicker.selectedOptions[0]?.textContent,
    opener:event.currentTarget
  }));
  window.addEventListener('popstate',sync);
  sync();
  if(current) panel.scrollIntoView({block:'start'});
  pricebook.then(data=>{
    book=data;
    for(const card of cards){
      const price=Math.min(...Object.values(data.prices[card.dataset.modelCard]));
      card.querySelector('[data-bath-price]').textContent='от '+rubles.format(price);
    }
    if(current) sync();
  }).catch(()=>{
    pricesUnavailable = true;
    if(current) sync();
  });
}
