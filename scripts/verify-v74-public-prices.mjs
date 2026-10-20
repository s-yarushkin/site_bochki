/** V74-02: fail-closed public price consistency.
 * Source: sanitized ONLY public A/B/J cells of the owner's Google workbook.
 * Never fetch/expose hidden calculations or private economics to browser/repo.
 * Optional --live checks current J against the committed snapshot using a
 * read-only OAuth access token injected by trusted CI (never logged).
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const load=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const snapshot=load('data/source/v74-public-rounded-sheet-snapshot.json');
const catalog=load('data/catalog-pricebook.json');
const v73=load('data/legacy-v73-catalog.json');
const keys={
  kvadro:['400','450','500','550','600'],
  viking:['400','450','500','550','600'],
  parus:['400','450','500','550','600'],
  'kvadro-house':['4x4','5x4','6x4','6x5','6x6'],
};
const modelNames={kvadro:'Квадро',viking:'Викинг',parus:'Парус','kvadro-house':'Квадро Хаус'};
const sizeNames={'400':'4 м','450':'4,5 м','500':'5 м','550':'5,5 м','600':'6 м','4x4':'4×4 м','5x4':'5×4 м','6x4':'6×4 м','6x5':'6×5 м','6x6':'6×6 м'};
const assert=(condition,code)=>{if(!condition)throw new Error(code)};
assert(snapshot.column==='J'&&snapshot.header==='Стоимость для сайта, округлённая, ₽','SOURCE_COLUMN_CHANGED');
assert(snapshot.rows.length===20,'BASE_SKU_COUNT');
assert(catalog.version===snapshot.pricebookVersion,'SOURCE_VERSION_MISMATCH');
assert(catalog.priceSource?.column===snapshot.column&&catalog.priceSource?.header===snapshot.header,'PRICEBOOK_PUBLIC_COLUMN_CONTRACT_MISMATCH');
const expected=[];
for(const [model,ids] of Object.entries(keys))for(const id of ids){
  const row=snapshot.rows.find(r=>r.modelId===model&&r.sizeId===id);
  const legacy=v73.prices[model]?.[id];
  assert(row&&Number.isSafeInteger(row.sitePriceRub),'MISSING_PUBLIC_PRICE');
  assert(row.sitePriceRub>0&&row.sitePriceRub%5000===0,'ROUNDING_INVALID');
  assert(row.sitePriceRub===Math.ceil(legacy/5000)*5000,'SOURCE_RULE_MISMATCH');
  assert(row.sitePriceRub===catalog.prices[model]?.[id],'WEBSITE_BASE_DIFFERS_FROM_SHEET');
  expected.push(row);
}
assert(new Set(expected.map(r=>r.sourceRow)).size===20,'DUPLICATE_SHEET_ROW');
assert(new Set(expected.map(r=>r.modelId+':'+r.sizeId)).size===20,'DUPLICATE_SKU');
assert(snapshot.rows.every(r=>expected.includes(r)),'UNEXPECTED_SKU');
for(const [id,legacy] of Object.entries(v73.options)){
  const current={...catalog.options[id]};delete current.mutex;delete current.pricingMode;
  assert(JSON.stringify(current)===JSON.stringify(legacy),'HISTORIC_EXTRA_CHANGED_'+id);
}
const approved={
  floor_insulation_50mm_area:1404,floor_insulation_100mm_area:2691,
  terrace_roof_area:23400,terrace_open_area:15210,terrace_dpk_area:18720
};
assert(Object.keys(catalog.options).length===Object.keys(v73.options).length+5,'UNAPPROVED_OPTION_COUNT');
for(const [id,rub] of Object.entries(approved)){
  assert(catalog.options[id]?.unitPriceRub===rub,'EXTRA_TARIFF_MISMATCH_'+id);
}
assert(catalog.pricingAdjustments?.installation?.['kvadro-house']?.basePriceRate===.1,'HOUSE_INSTALLATION_MISSING');
assert(catalog.pricingAdjustments?.cashlessSurchargeVisible===false,'CASHLESS_DISCLOSURE_PROHIBITED');
const input=readFileSync(join(root,'index.html'),'utf8');
assert(input.includes('id="quoteTotal">505 000 ₽'),'HTML_INITIAL_BASE_MISMATCH');
assert(input.includes('id="bundleNew">618 022 ₽'),'HTML_FEATURED_BUNDLE_MISMATCH');
assert(catalog.checks.baseRub===505000&&catalog.checks.bundleTotalRub===618022,'CHECKSUM_MISMATCH');
console.log('V74_SNAPSHOT_BASE_PRICES=PASS; VERIFIED=20; COLUMN=J; HISTORIC_EXTRAS_UNCHANGED=1; NEW_EXTRAS=5');

if(process.argv.includes('--live')){
 const id=process.env.DACHAPAR_SHEETS_ID,token=process.env.DACHAPAR_SHEETS_READ_TOKEN;
 assert(id&&token,'LIVE_SHEETS_CREDENTIALS_REQUIRED');
 const ranges=["'Рабочий калькулятор'!A225:B244","'Рабочий калькулятор'!J225:J244"];
 const fetchRange=async range=>{
   const endpoint='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id)+'/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE';
   const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('SHEETS_SOURCE_UNAVAILABLE_'+response.status);
   const body=await response.json();
   assert(Array.isArray(body.values)&&body.values.length===20,'SHEETS_20_ROWS_REQUIRED');
   return body.values;
 };
 const [labels,values]=await Promise.all(ranges.map(fetchRange));
 for(let i=0;i<20;i++){
   const row=snapshot.rows.find(r=>r.sourceRow===225+i);
   assert(row&&labels[i]?.[0]===modelNames[row.modelId]&&labels[i]?.[1]===sizeNames[row.sizeId],'SHEETS_ROW_KEYS_CHANGED_'+(i+225));
   assert(values[i]?.[0]===row.sitePriceRub,'SHEET_CHANGED_NEW_PRICE_PR_REQUIRED_'+(i+225));
 }
 console.log('LIVE_GOOGLE_SHEET_COLUMN_H=PASS; VERIFIED=20; NO_PRIVATE_DATA_READ=1');
}
