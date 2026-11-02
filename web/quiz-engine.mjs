/** Pure quiz selection and preliminary price logic. Never duplicate Comfort base prices. */
export const ANSWERS=Object.freeze({
  party:['p2','p4','p6','p8'],
  wash:['w_yes','w_no','w_compare'],
  bedroom:['b_yes','b_no']
});
export const PAIRING=Object.freeze({
  p2:{name:'Для спокойного отдыха вдвоём',desiredLength:4.5},
  p4:{name:'Для банных вечеров с близкими',desiredLength:5},
  p6:{name:'Для встреч своей компанией',desiredLength:6},
  p8:{name:'Для большой компании',desiredLength:6}
});
const houseMeters=Object.freeze({'4x4':4,'5x4':5,'6x4':6,'6x5':6,'6x6':6});
export const validAnswers=answers=>Boolean(answers&&ANSWERS.party.includes(answers.party)&&ANSWERS.wash.includes(answers.wash)&&ANSWERS.bedroom.includes(answers.bedroom));
export function selectStove(party, rules){
  if(!ANSWERS.party.includes(party))throw new Error('QUIZ_PARTY_INVALID');
  const stove=rules.stoves[party];
  if(!stove||!Number.isFinite(stove.surchargeRub))throw new Error('QUIZ_STOVE_RULE_MISSING');
  return stove;
}
export function planPrice(plan, party, pricebook, rules){
  const stove=selectStove(party,rules);
  if(plan.wideBody)return {rub:null,status:'needs-quote',stove:stove.id,addedRooms:Math.max(0,plan.rooms-plan.baseRooms)};
  const base=pricebook?.prices?.[plan.model]?.[plan.size];
  if(!Number.isFinite(base))return {rub:null,status:'missing-comfort',stove:stove.id,addedRooms:0};
  const addedRooms=Math.max(0,plan.rooms-plan.baseRooms);
  if(!Number.isInteger(addedRooms)||addedRooms<0||!Number.isFinite(rules.extraRoomRub))throw new Error('QUIZ_ROOM_RULE_INVALID');
  return {rub:base+addedRooms*rules.extraRoomRub+stove.surchargeRub,status:'preliminary',stove:stove.id,addedRooms,baseComfortRub:base,stoveSurchargeRub:stove.surchargeRub};
}
export function matchingPlans(plans,answers){
  if(!validAnswers(answers))throw new Error('QUIZ_ANSWERS_INCOMPLETE');
  const bed=answers.bedroom==='b_yes';
  const bedroomMatch=plans.filter(p=>p.bedroom===bed);
  let exact=bedroomMatch.filter(p=>answers.wash==='w_compare'||(answers.wash==='w_yes'?p.wash==='Отдельная':p.wash!=='Отдельная'));
  const compromise=exact.length===0&&bed&&answers.wash==='w_no';
  if(compromise)exact=bedroomMatch;
  return {matches:exact,compromise};
}
function lengthFor(p){if(p.model==='kvadro-house')return houseMeters[p.size]||6;return Number(p.size)/100;}
export function scorePlan(p,a){
  const l=lengthFor(p),target=PAIRING[a.party].desiredLength;
  let score=100-Math.abs(l-target)*20;
  if(a.party==='p2'&&l>5)score-=15;
  if(a.party==='p6'&&l>=6)score+=11;
  if(a.party==='p8'){score+=p.model==='kvadro-house'?30:0;score+=(p.size==='6x6'||p.size==='6x5')?16:0;score+=p.wideBody?8:0;}
  if(a.party==='p4'&&l===5)score+=7;
  // Small parties first see standard compact bodies; bedrooms still filter to House.
  if(['p2','p4'].includes(a.party)&&p.model!=='kvadro-house'&&!p.wideBody)score+=10;
  if(a.wash==='w_compare'&&p.wash==='Отдельная')score+=2;
  if(p.wideBody)score-=6;
  if(p.bedroom&&a.bedroom==='b_yes')score+=14;
  return score;
}
export function rankPlans(plans,answers,limit=4){
  if(!validAnswers(answers))throw new Error('QUIZ_ANSWERS_INCOMPLETE');
  const {matches,compromise}=matchingPlans(plans,answers);
  const ranked=[...matches].sort((a,b)=>scorePlan(b,answers)-scorePlan(a,answers)||a.code.localeCompare(b.code));
  const result=[],used=new Set(),styles=new Set();
  const pick=predicate=>{const p=ranked.find(x=>!used.has(x.code)&&predicate(x));if(p){result.push(p);used.add(p.code);styles.add(xKey(p));}return Boolean(p)};
  const xKey=p=>p.model+':'+p.size;
  if(answers.wash==='w_compare'&&!compromise){pick(p=>p.wash==='Отдельная');pick(p=>p.wash!=='Отдельная');}
  while(result.length<limit&&result.length<ranked.length){
    if(pick(p=>!styles.has(xKey(p))))continue;
    if(pick(()=>true))continue;
    break;
  }
  return {top:result,all:ranked,compromise};
}
export function guestExplanation(a){
  return a.party==='p8'?'Для встречи большой компанией выбрали более просторные варианты. В парную можно ходить по очереди.':
    a.party==='p6'?'Для банных вечеров с друзьями: хороший пар, чай и время для разговоров.':
    a.party==='p4'?'Чтобы провести вечер с близкими, без спешки и лишних хлопот.':'Для тех вечеров, когда хочется отдохнуть вдвоём и никуда не спешить.';
}

/** Model offers do not require a published floor-plan image. */
export function recommendModels(plans,answers,pricebook,rules,limit=3){
 const found=rankPlans(plans,answers,plans.length),seen=new Set(),offers=[];
 for(const plan of found.all){
  if(plan.sitePlanId==='v03_Q6_rest'||seen.has(plan.model))continue;
  const price=planPrice(plan,answers.party,pricebook,rules);
  if(price.rub===null)continue;
  seen.add(plan.model);offers.push({plan,price});
  if(offers.length>=limit)break;
 }
 return {offers,compromise:found.compromise};
}

/**
 * R108: suggest a *range* (not one fixed length) for each applicable model.
 * Valid sizes are 5 and 6 m only; ignore 4.5/5.5 m. The House 4x4 is the
 * explicitly requested compact comparison exception.
 *
 * Deliberately do NOT calculate any Deluxe discount against Comfort prices.
 */
export function recommendModelRanges(plans, answers, pricebook, rules) {
  if(!validAnswers(answers))throw new Error('QUIZ_ANSWERS_INCOMPLETE');
  const small=['p2','p4'].includes(answers.party);
  const wantsBedroom=answers.bedroom==='b_yes';
  const partyLarge=!small;
  const validWash=p=>answers.wash==='w_compare'||
    (answers.wash==='w_yes'?p.wash==='Отдельная':p.wash!=='Отдельная');
  const prepared=plans.filter(p=>!p.wideBody&&p.sitePlanId!=='v03_Q6_rest');
  const base=prepared.filter(p=>p.bedroom===wantsBedroom);
  const bedroomConflict=wantsBedroom&&answers.wash==='w_no'&&!base.some(p=>validWash(p));
  const matches=base.filter(p=>{
    if(!bedroomConflict&&!validWash(p))return false;
    if(wantsBedroom)return p.model==='kvadro-house'&&p.size==='6x6';
    if(p.model==='kvadro'&&partyLarge)return false;
    if(p.model==='kvadro-house'){
      if(small)return answers.wash==='w_compare'&&p.size==='4x4';
      // Large-party House: choose a genuinely more spacious family model.
      if(answers.wash==='w_no')return false;
      return answers.party==='p8'?['6x5','6x6'].includes(p.size):
        ['5x4','6x4'].includes(p.size);
    }
    return p.size==='500'||p.size==='600';
  });
  const order=wantsBedroom?['kvadro-house']:small?
    ['kvadro','parus','viking','kvadro-house']:['parus','viking','kvadro-house'];
  const results=[];
  for(const model of order){
    const pool=matches.filter(p=>p.model===model).map(plan=>({
      plan,price:planPrice(plan,answers.party,pricebook,rules)
    })).filter(x=>Number.isFinite(x.price.rub));
    if(!pool.length)continue;
    // Lower end: Comfort of the smallest actually suitable layout with its already
    // approved preliminary room/stove adjustments. Upper end: the *published*
    // Deluxe matrix of the largest suitable standard size. The Deluxe matrix
    // ALREADY contains the ASTON +12k upgrade and the +20k customer gift:
    // never apply a second stove charge or an inferred room charge to it.
    const byOrder=[...pool].sort((x,y)=>{
      const lengthOrder = model==='kvadro-house'
        ? ['4x4','5x4','6x4','6x5','6x6']
        : ['500','600'];
      return lengthOrder.indexOf(x.plan.size)-lengthOrder.indexOf(y.plan.size)||
        x.price.rub-y.price.rub;
    });
    const first=byOrder[0].plan,last=byOrder[byOrder.length-1].plan;
    const sizes=[...new Set(byOrder.map(x=>x.plan.size))];
    const lower=Math.min(...byOrder.filter(x=>x.plan.size===first.size).map(x=>x.price.rub));
    const upper=pricebook?.deluxePrices?.[model]?.[last.size];
    if(!Number.isFinite(upper)||upper<lower)throw new Error('QUIZ_DELUXE_PRICE_MISSING_OR_INVALID:'+model+':'+last.size);
    results.push({
      model,plans:byOrder.map(x=>x.plan),codes:byOrder.map(x=>x.plan.code),
      sizes,firstSize:first.size,lastSize:last.size,
      rangeLowerPackage:'comfort',rangeUpperPackage:'deluxe',
      minRub:lower,maxRub:upper,
      displayMinRub:Math.ceil(lower/1000)*1000,
      displayMaxRub:Math.ceil(upper/1000)*1000
    });
  }
  return {offers:results,compromise:bedroomConflict};
}
