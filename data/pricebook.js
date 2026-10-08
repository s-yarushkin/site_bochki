// Открытые демонстрационные цены. НЕ дилерский прайс; НЕ оферта.
export const PRICEBOOK = Object.freeze({
  version: '2026-10-08-demo-v4', status: 'DEMO_ONLY', currency: 'RUB',
  models: [
    {id:'kvadro',name:'Квадро',subtitle:'Компактная баня для дачного участка',sizes:{'400':409000,'500':429000,'600':459000},slot:'catalog-kvadro'},
    {id:'parus',name:'Парус',subtitle:'Выразительная форма, настоящий банный отдых',sizes:{'400':419000,'500':469000,'600':499000},slot:'catalog-parus'},
    {id:'viking',name:'Викинг',subtitle:'Заметный характер, тёплые выходные',sizes:{'400':419000,'500':539000,'600':579000},slot:'catalog-viking'},
    {id:'kvadro-house',name:'Квадро Хаус',subtitle:'Пространство для отдыха с близкими',sizes:{'500':659000,'600':709000},slot:'catalog-kvadro-house'}
  ],
  options: [
    {id:'aspen',name:'Осиновая отделка парной',price:129000,category:'steam',benefit:'Приятная на ощупь отделка парной',discountEligible:true},
    {id:'water-piping',name:'Водоснабжение с разводкой',price:79000,category:'comfort',benefit:'Больше удобства в помывочной',discountEligible:true},
    {id:'steam-led',name:'Подсветка парной',price:27000,category:'steam',benefit:'Мягкий свет для уютного вечера',discountEligible:true},
    {id:'porch',name:'Крыльцо',price:24000,category:'comfort',benefit:'Удобный вход в баню',discountEligible:true},
    {id:'window',name:'Дополнительное окно',price:9000,category:'comfort',benefit:'Больше дневного света',discountEligible:true},
    {id:'firebox',name:'Выносная топка',price:19000,category:'steam',benefit:'Выберите подходящий вариант топки',discountEligible:true},
    {id:'acrylic-shower',name:'Акриловый душевой поддон',price:23000,category:'comfort',benefit:'Удобство водных процедур',discountEligible:true},
    {id:'polok-light',name:'Подсветка под полком',price:9000,category:'steam',benefit:'Тёплое свечение без яркого света',discountEligible:true},
    {id:'metal-door',name:'Металлическая входная дверь',price:29000,category:'comfort',benefit:'Альтернативное исполнение входа',discountEligible:true,mutex:'entry-door'},
    {id:'canopy',name:'Козырёк',price:9000,category:'comfort',benefit:'Защита пространства у входа',discountEligible:true},
    {id:'black-chimney',name:'Чёрный дымоход',price:11000,category:'steam',benefit:'Акцент в отделке',discountEligible:true},
    {id:'shelf',name:'Дополнительная полка',price:5000,category:'comfort',benefit:'Место для нужных мелочей',discountEligible:true},
    {id:'glass-door-170',name:'Стеклянная дверь 170 × 70',price:19000,category:'comfort',benefit:'Один из размеров на выбор',discountEligible:true,mutex:'entry-door'},
    {id:'glass-door-180',name:'Стеклянная дверь 180 × 70',price:26000,category:'comfort',benefit:'Один из размеров на выбор',discountEligible:true,mutex:'entry-door'},
    {id:'glass-door-190',name:'Стеклянная дверь 190 × 70',price:32000,category:'comfort',benefit:'Один из размеров на выбор',discountEligible:true,mutex:'entry-door'}
  ],
  bundle:{id:'family-comfort-demo',name:'Дачный отдых — Комфорт+',modelId:'kvadro-house',sizeId:'500',optionIds:['aspen','water-piping','steam-led','porch','window'],discount:70000},
  progressive:[{min:5,rate:10},{min:4,rate:7},{min:3,rate:5},{min:2,rate:3}],
  deliveryIncluded:false
});
