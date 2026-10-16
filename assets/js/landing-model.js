// A model page may open the existing configurator with a known model selected.
export function readLandingModel(search,models){
 const value=new URLSearchParams(search).get('model');
 return models.find(model=>model.id===value)??null;
}

// Only known page topics can prefill the manager form; arbitrary URL text is ignored.
export function readLandingContact(search){
 const params=new URLSearchParams(search);
 if(params.get('contact')!=='manager')return null;
 const topics={kontakty:'Помощь с выбором бани',bani:'Подбор модели бани',kvadro:'Модель Квадро',parus:'Модель Парус',viking:'Модель Викинг','kvadro-haus':'Модель Квадро Хаус','dostavka-i-ustanovka':'Доставка и установка бани',voprosy:'Вопросы перед заказом бани'};
 return Object.hasOwn(topics,params.get('from'))?topics[params.get('from')]:'Помощь с выбором бани';
}
