export const HERO_MODELS=Object.freeze({
  kvadro:{name:'Квадро',asset:'kvadro',spec:'Ширина 2,1 м · длина 4–6 м',slug:'kvadro'},
  parus:{name:'Парус',asset:'parus',spec:'Ширина 2,4 м · длина 4–6 м',slug:'parus'},
  viking:{name:'Викинг',asset:'viking',spec:'Ширина 2,4 м · длина 4–6 м',slug:'viking'},
  'kvadro-house':{name:'Квадро Хаус',asset:'house',spec:'Размеры от 4 × 4 до 6 × 6 м',slug:'kvadro-haus'}
});
export const validHeroModel=value=>Object.hasOwn(HERO_MODELS,value||'')?value:'kvadro';
export function heroOffer(book,model){
  const id=validHeroModel(model),sizes=Object.entries(book.prices[id]);
  const [size,price]=sizes.reduce((a,b)=>a[1]<=b[1]?a:b);
  return {model:id,...HERO_MODELS[id],size,price,plans:'/planirovki/?model='+id,detail:'/bani/'+HERO_MODELS[id].slug+'/'};
}
