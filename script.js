const ASSETS = window.GARANT_ASSETS || {};
if (ASSETS.hero) document.documentElement.style.setProperty('--img-hero', `url("${ASSETS.hero}")`);
if (ASSETS.final) document.documentElement.style.setProperty('--img-final', `url("${ASSETS.final}")`);
document.querySelectorAll('[data-asset]').forEach((image) => {
  const src = ASSETS[image.dataset.asset];
  if (src) image.src = src;
});

const menu = document.querySelector('.menu-button');
const nav = document.querySelector('.nav');
if (menu && nav) {
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') === 'true';
    menu.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('nav--open', !open);
  });
}

const mainImage = document.querySelector('#project-main');
document.querySelectorAll('.gallery-thumbs button').forEach((button) => {
  button.addEventListener('click', () => {
    if (!mainImage) return;
    mainImage.src = ASSETS[button.dataset.imageKey] || mainImage.src;
    mainImage.alt = button.dataset.alt || '';
  });
});

document.querySelector('.estimate-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  alert('Форма пока демонстрационная. На следующем этапе подключим VK, телефон или CRM.');
});
