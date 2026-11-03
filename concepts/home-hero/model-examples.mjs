import {createLayoutGallery,layoutJson} from './layout-panel.mjs';

const section = document.querySelector('[data-model-examples]');
const status = section.querySelector('[role="status"]');
section.querySelector('label')?.remove();
const gallery = section.querySelector('.hh-layout-panel');
gallery.className = 'hh-layout-gallery';
const note = document.createElement('p');
note.className = 'hh-examples-note';
note.textContent = 'Это примеры размещения помещений и мебели. Габариты каждого варианта указаны на чертеже; размер бани для расчёта стоимости выбирается отдельно.';
gallery.before(note);
status.textContent = 'Загружаем примеры…';
layoutJson('index.json').then(({plans})=>{
  const examples = plans.filter(plan=>plan.models.includes(section.dataset.modelExamples));
  createLayoutGallery(gallery,examples);
  status.textContent = examples.length ? '' : 'Примеры планировок для этой модели готовятся.';
}).catch(()=>{status.textContent = 'Примеры сейчас недоступны. Попробуйте обновить страницу.';});
