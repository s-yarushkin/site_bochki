export const objects = [
  {
    "id": "timber-graphite",
    "title": "Тёплое дерево и графитовая кровля",
    "subtitle": "Снаружи и внутри",
    "photos": [
      {
        "id": "kq-06",
        "caption": "Боковой вход и корпус",
        "kind": "Снаружи",
        "alt": "Квадро с боковым стеклянным входом, тёмной кровлей и деревянной отделкой"
      },
      {
        "id": "kq-08",
        "caption": "Фасад и боковой вход",
        "kind": "Снаружи",
        "alt": "Квадро в ракурсе три четверти: двухстворчатое окно, боковой вход и деревянные ступени"
      },
      {
        "id": "kq-05",
        "caption": "Окно комнаты отдыха",
        "kind": "Снаружи",
        "alt": "Торцевая стена Квадро с окном комнаты отдыха и боковой вход в баню"
      },
      {
        "id": "kq-13",
        "caption": "Комната отдыха",
        "kind": "Внутри",
        "alt": "Комната отдыха Квадро с деревянным столом, двумя лавками и окном на участок"
      },
      {
        "id": "kq-12",
        "caption": "Парная: полки в два яруса",
        "kind": "Внутри",
        "alt": "Светлая парная Квадро: двухъярусные деревянные полки, небольшое окно и светильники"
      },
      {
        "id": "kq-11",
        "caption": "Парная с другого ракурса",
        "kind": "Внутри",
        "alt": "Парная Квадро: полки, металлический таз, ковш и линейный слив в полу"
      },
      {
        "id": "kq-09",
        "caption": "Печь, бак и ограждение",
        "kind": "Детали",
        "alt": "Печь с камнями, баком для воды и деревянным ограждением в парной Квадро"
      },
      {
        "id": "kq-10",
        "caption": "Вход в парную и выносная топка",
        "kind": "Внутри",
        "alt": "Стеклянная дверь парной и выносная топка с металлической защитой пола"
      }
    ]
  }
];
export const layouts = [
  {
    "id": "kvadro-4-rest",
    "title": "Компактная баня с комнатой отдыха",
    "size": "4 × 2,1 м",
    "floorArea": "≈ 7,3 м²",
    "tag": "Два помещения",
    "custom": false,
    "text": "Парная с Г-образными полками и комната отдыха со столом и лавками.",
    "features": [
      "Полки в два яруса",
      "Стол и две лавки",
      "Боковой вход"
    ]
  },
  {
    "id": "kvadro-6-rest",
    "title": "Больше места для отдыха",
    "size": "6 × 2,1 м",
    "floorArea": "≈ 11,6 м²",
    "tag": "Для дачных вечеров",
    "custom": false,
    "text": "Комната отдыха с общим столом и двумя лавками, парная с полками в два яруса.",
    "features": [
      "Комната отдыха ≈ 6,6 м²",
      "Печь с выносом топки",
      "Нижний полок выдвигается"
    ]
  },
  {
    "id": "kvadro-6-wide",
    "title": "Широкое исполнение",
    "size": "6 × 3 м",
    "floorArea": "≈ 16,1 м²",
    "tag": "Индивидуальное исполнение",
    "custom": true,
    "text": "Просторная комната отдыха и большая парная с Г-образными полками.",
    "features": [
      "Комната отдыха ≈ 9,3 м²",
      "Парная ≈ 6,8 м²",
      "Размер и доставку обсудим отдельно"
    ]
  }
];
export function referenceText(id){
 const object=objects.find(o=>'photo-'+o.id===id);
 if(object)return 'Фото Квадро: '+object.title+'. Обсудить похожее исполнение.';
 const plan=layouts.find(p=>'plan-'+p.id===id);
 return plan?'Планировка Квадро: '+plan.title+', '+plan.size+'. Оснащение и стоимость согласовать.':'';
}
export function referenceLabel(id){
 const object=objects.find(o=>'photo-'+o.id===id);
 if(object)return 'Вам понравилась баня: '+object.title+'.';
 const plan=layouts.find(p=>'plan-'+p.id===id);
 return plan?'Выбрана планировка: '+plan.title+', '+plan.size+'.':'';
}
export function appendReference(payload,id){
 const text=referenceText(id);if(!text)return payload;
 const original=String(payload.comment||'').trim().slice(0,Math.max(0,499-text.length)).trimEnd();
 return {...payload,comment:(original?original+' ':'')+text};
}
