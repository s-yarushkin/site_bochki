// Read only the website price column. Dealer prices and RRP are never fallbacks.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const aliases={tilt_window_1400x800:'ПВХ 1400×800, откидное',remote_firebox_adjacent:'Вынос топки в смежное помещение / на улицу',outdoor_two_lanterns:'Уличное освещение, 2 фонаря'};
export function importSitePrices(source,baseline){
 if(source.sheet!=='Рабочий калькулятор'||source.column!=='C'||source.header!=='ЦЕНА НА САЙТЕ, ₽')throw Error('WRONG_SOURCE_COLUMN');
 const book=structuredClone(baseline),baseRows=source.rows.filter(r=>Object.values(book.models).some(m=>m.name===r.section));
 const check=(v,key)=>{if(!Number.isSafeInteger(v)||v<=0)throw Error('SITE_PRICE_REQUIRED: '+key);return v;};
 const cells={};let count=0;
 for(const [id,model] of Object.entries(book.models))for(const size of Object.keys(book.prices[id])){
  const label=model.sizeKind==='full'?size.replace('x','×')+' м':String(Number(size)/100).replace('.',',')+' м';
  const rows=baseRows.filter(r=>r.section===model.name&&r.name===label);
  if(rows.length!==1)throw Error('BASE_ROW_NOT_UNIQUE: '+id+'/'+size);
  book.prices[id][size]=check(rows[0].sitePriceRub,id+'/'+size);cells[id+'/'+size]='C'+rows[0].row;count++;
 }
 if(count!==20||baseRows.length!==20)throw Error('BASE_MATRIX_CHANGED');
 for(const [id,option] of Object.entries(book.options)){
  const label=aliases[id]??option.label;
  const rows=source.rows.filter(r=>r.row<222&&r.name===label);
  if(rows.length!==1)throw Error('OPTION_ROW_NOT_UNIQUE: '+id);
  option.unitPriceRub=check(rows[0].sitePriceRub,id);option.source='Google Sheets · '+source.sheet+'!C'+rows[0].row;cells[id]='C'+rows[0].row;
 }
 book.version='2026-10-16-sheet-site-v1';
 book.source='Owner Google Sheets · ЦЕНА НА САЙТЕ (C); reviewed snapshot; no dealer/RRP fallback';
 book.priceSource={spreadsheetUrl:source.spreadsheetUrl,sheet:source.sheet,column:source.column,header:source.header,readAt:source.readAt,syncMode:'REVIEWED_SNAPSHOT',cells};
 book.pricingAdjustments={policy:'Final site-column amounts are already complete. Never add historic uplifts again.'};
 const base=book.prices[book.featuredBundle.modelId][book.featuredBundle.sizeId];
 const extras=book.featuredBundle.selectedOptionIds.reduce((sum,id)=>sum+book.options[id].unitPriceRub*book.options[id].quantity,0);
 book.checks={...book.checks,baseRub:base,optionRub:extras,knownSubtotalRub:base+extras-book.featuredBundle.discountRub,previousKnownSubtotalRub:baseline.checks.knownSubtotalRub};
 book.notes=['Prices are a reviewed snapshot of website column C, not a live Google Sheets connection.','No dealer prices, RRP, workbook calculations or manual discount cells are published.','Option quantities in the featured kit stay unchanged; spreadsheet checkboxes and selection quantities are not product price definitions.','Color/roof surcharges remain unset. Delivery, unloading, foundation and connections are quoted separately.','Special offer mentioned in free-text sheet notes is not imported as a column-C price or an invented discount.'];
 return book;
}
export function updateStaticPrices(book,html){
 const money=n=>n.toLocaleString('ru-RU').replaceAll('\u00a0',' ')+' ₽';
 const total=money(book.checks.knownSubtotalRub);
 return html.replace(/(Готовый комплект за )[\d \u00a0]+ ₽/,(_,prefix)=>prefix+total)
  .replace(/(id="bundleOld">)[^<]+/,(_,prefix)=>prefix+total)
  .replace(/(id="bundleNew">)[^<]+/,(_,prefix)=>prefix+total)
  .replace(/(id="quoteTotal">)[^<]+/,(_,prefix)=>prefix+money(book.prices.kvadro['500']));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const source=JSON.parse(readFileSync(resolve(ROOT,process.argv[2]??'data/source/site-prices-2026-10-16.json'),'utf8'));
 const baseline=JSON.parse(readFileSync(resolve(ROOT,'data/legacy-v72-catalog.json'),'utf8'));
 const book=importSitePrices(source,baseline);
 writeFileSync(resolve(ROOT,'data/catalog-pricebook.json'),JSON.stringify(book,null,2)+'\n');
 const home=resolve(ROOT,'index.html');writeFileSync(home,updateStaticPrices(book,readFileSync(home,'utf8')));
 console.log('SITE_PRICES_IMPORTED=PASS; BASES=20; OPTIONS='+Object.keys(book.options).length+'; VERSION='+book.version);
}
