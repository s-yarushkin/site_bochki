import {createLayoutPanel,layoutJson} from './layout-panel.mjs';

const section = document.querySelector('[data-model-examples]');
const picker = section.querySelector('select');
const status = section.querySelector('[role="status"]');
const setLayout = createLayoutPanel(section.querySelector('.hh-layout-panel'));
status.textContent = 'Загружаем примеры…';
layoutJson('index.json').then(({plans})=>{
  const examples = plans.filter(plan=>plan.models.includes(section.dataset.modelExamples));
  picker.replaceChildren(...examples.map(plan=>new Option(plan.label,plan.id)));
  picker.closest('label').hidden = examples.length < 2;
  const draw = ()=>setLayout(examples.find(plan=>plan.id === picker.value));
  picker.addEventListener('change',draw);
  draw();
  status.textContent = examples.length ? '' : 'Примеры планировок для этой модели готовятся.';
}).catch(()=>{status.textContent = 'Примеры сейчас недоступны. Попробуйте обновить страницу.';});
