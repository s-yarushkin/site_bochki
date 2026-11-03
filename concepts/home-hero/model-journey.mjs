import {HERO_MODELS} from './catalog.mjs';
import {openModelRequest} from './model-request.mjs';

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
    content.append(name, spec, desc, price);
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
        <div class="hh-bath-plan">
          <h3>Планировка</h3>
          <label class="hh-bath-variant" hidden>Вариант <select></select></label>
          <figure hidden><img alt=""><figcaption></figcaption></figure>
          <p class="hh-bath-plan-status" role="status"></p>
        </div>
      </div>
      <div class="hh-bath-offer">
        <div><strong>Скидка 20 000 ₽ на «Делюкс»</strong>
        <p>Пришлём расширенную подборку планировок и комплектаций с ценами в удобный мессенджер.</p></div>
        <button class="btn" type="button">Получить планировки и цены</button>
      </div>
    </div>`;
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
  const variant = find('.hh-bath-variant select');
  const prices = find('.hh-bath-prices');
  const figure = find('figure');
  const planStatus = find('.hh-bath-plan-status');
  let book, pricesUnavailable, plans, planLoad, shownPlans = [], current, size, lastCard;

  function drawPlan(){
    const plan = shownPlans[Number(variant.value)];
    figure.hidden = !plan;
    if(!plan) return;
    const image = figure.querySelector('img');
    image.alt = plan.title;
    image.src = '/' + plan.image;
    figure.querySelector('figcaption').textContent = plan.description;
  }

  function drawSize(){
    find('.hh-bath-variant').hidden = true;
    figure.hidden = true;
    if(!book){
      planStatus.textContent = pricesUnavailable ? 'Планировку пришлём в подборке.' : 'Выберите размер после загрузки цен.';
      return;
    }
    const row = book.r85.models[current].sizes[size];
    prices.replaceChildren();
    for(const [name, price] of [['Комфорт', row.priceRub], ['Делюкс', row.deluxe?.priceRub]]){
      if(!Number.isFinite(price)) continue;
      const line = document.createElement('span');
      line.textContent = name + ' · ' + rubles.format(price);
      prices.append(line);
    }
    const note = document.createElement('small');
    note.textContent = (row.deluxe?.priceStatus === 'calculated' ? 'Цена «Делюкса» предварительная. ' : '') + 'Доставка рассчитывается отдельно.';
    prices.append(note);
    shownPlans = plans?.filter(plan=>plan.model === current && plan.size === size) ?? [];
    planStatus.textContent = shownPlans.length ? '' : plans ? 'Для этого размера схему пришлём в подборке.' :
      planLoad ? 'Загружаем схемы…' : 'Схемы сейчас недоступны. Пришлём их в подборке.';
    variant.replaceChildren(...shownPlans.map((_, index)=>new Option('Вариант ' + (index + 1), index)));
    find('.hh-bath-variant').hidden = shownPlans.length < 2;
    drawPlan();
  }

  function sync(){
    const url = new URL(location.href);
    const id = url.searchParams.get('bath');
    current = url.hash === '#bath-model' && Object.hasOwn(HERO_MODELS,id) ? id : null;
    panel.hidden = !current;
    grid.hidden = heading.hidden = listNav.hidden = Boolean(current);
    if(entry) entry.hidden = Boolean(current);
    if(!current) return;
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
    if(!planLoad && !plans){
      planLoad = fetch('/data/r94-layouts.json',{signal:AbortSignal.timeout(10000)})
        .then(response=>{if(!response.ok) throw Error('PLANS'); return response.json();})
        .then(data=>{plans=data.plans;})
        .catch(()=>{planLoad=null;})
        .finally(()=>{if(current) drawSize();});
    }
    drawSize();
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
  sizePicker.addEventListener('change',()=>{
    size=sizePicker.value;
    history.replaceState(history.state,'',route('bath-model',current,size));
    drawSize();
  });
  variant.addEventListener('change',drawPlan);
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
