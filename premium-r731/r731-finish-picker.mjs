/** R73.1 finish selectors. Uses existing catalog-rendered select options and change
 * events. No changes to model/size pricing, quotation logic or submitted finish IDs.
 * Samples come from owner's catalog, not renders of a finished bathhouse.
 */
const ROOT = 'assets/catalog-v66/';
const groups = [
  ['finish-select', 'body', 'Цвет корпуса'],
  ['roof-select', 'roof', 'Цвет кровли'],
];
for (const [selectId, kind, groupName] of groups) {
  const select = document.getElementById(selectId);
  if (!select) continue;
  const field = select.closest('label');
  if (!field) continue;
  const palette = document.createElement('div');
  palette.className = 'r731-finish-palette';
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', groupName);
  const caption = document.createElement('p');
  caption.className = 'r731-finish-hint';
  caption.textContent = 'Образцы оттенков из каталога. Цвет на экране приблизителен: точный образец и доплату уточним перед заказом.';
  // Interactive swatches must not be nested inside the original <label>.
  field.insertAdjacentElement('afterend', palette);
  palette.insertAdjacentElement('afterend', caption);
  const updateSelection = () => {
    for (const button of palette.querySelectorAll('.r731-finish-option')) {
      button.setAttribute('aria-pressed', String(button.dataset.finishId === select.value));
    }
  };
  const draw = () => {
    const options = Array.from(select.options);
    if (options.length < 2) return; // Wait for actual application catalog.
    const buttons = options.map(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'r731-finish-option';
      button.dataset.finishId = option.value;
      button.setAttribute('aria-label', groupName + ': ' + option.textContent);
      const preview = document.createElement('span');
      preview.className = 'r731-finish-preview';
      if (option.value && /^[a-z0-9_]+$/.test(option.value)) {
        const image = document.createElement('img');
        image.src = ROOT + kind + '-' + option.value + '.webp';
        image.alt = '';
        image.loading = 'lazy';
        image.width = 104;
        image.height = 68;
        image.addEventListener('error', () => {
          preview.replaceChildren();
          preview.textContent = 'Нет образца';
          preview.classList.add('r731-preview-missing');
          button.disabled = true; // Owner requires image before choosing colour.
          button.title = 'Образец недоступен. Уточните цвет у менеджера.';
        }, {once:true});
        preview.append(image);
      } else {
        preview.textContent = '?';
        preview.classList.add('r731-preview-neutral');
      }
      const name = document.createElement('span');
      name.className = 'r731-finish-name';
      name.textContent = option.textContent;
      button.append(preview, name);
      button.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', {bubbles:true}));
        updateSelection();
      });
      return button;
    });
    palette.replaceChildren(...buttons);
    field.classList.add('r731-picker-ready');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    updateSelection();
  };
  new MutationObserver(draw).observe(select, {childList: true});
  select.addEventListener('change', updateSelection);
  draw();
}
