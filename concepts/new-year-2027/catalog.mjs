import {calculate} from '../../web/quote.mjs';

export const MODELS=Object.freeze({
  kvadro:{name:'Квадро',image:'winter-sauna',description:'Парная и комната отдыха в компактном корпусе.',dimensions:'Ширина 2,1 м'},
  parus:{name:'Парус',image:'winter-parus',description:'Прямые стены и больше свободы для вашего банного вечера.',dimensions:'Ширина 2,4 м'},
  viking:{name:'Викинг',image:'winter-viking',description:'Узнаваемый арочный силуэт. Внутри — парная и комната отдыха.',dimensions:'Ширина 2,4 м'},
  'kvadro-house':{name:'Квадро Хаус',image:'winter-house',description:'Больше пространства для отдыха с семьёй и гостями.',dimensions:'Размеры от 4 × 4 до 6 × 6 м'}
});
export function modelSelection(book,input={}){
  const model=Object.hasOwn(MODELS,input.model||'')?input.model:'kvadro';
  const sizes=book.r85.models[model].sizes;
  const size=Object.hasOwn(sizes,String(input.size))?String(input.size):Object.keys(sizes)[0];
  return {model,size,package:'comfort',options:[],quantities:{},planId:null,mirror:false};
}
export function modelOffer(book,input){
  const selection=modelSelection(book,input),model=MODELS[selection.model];
  return {...model,selection,sizeLabel:book.r85.models[selection.model].sizes[selection.size].label,price:calculate(book,selection).total};
}
export const priceText=value=>'от '+new Intl.NumberFormat('ru-RU').format(value)+' ₽';
