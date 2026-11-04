import fs from 'node:fs/promises';
import {quoteLayout} from './layout-pricing.mjs';
const folder=new URL('pricing/',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',folder)));
const bills=JSON.parse(await fs.readFile(new URL('bills.json',folder)));
const quotes=bills.flatMap(bill=>['comfort','deluxe'].map(pack=>({billId:bill.id,number:bill.number,...quoteLayout(catalog,bill,pack)})));
const incomplete=quotes.filter(q=>q.calculatedTotalCents===null);
if(incomplete.length)throw Error(JSON.stringify(incomplete.map(q=>({id:q.billId,pack:q.package,pending:q.pending}))));
await fs.writeFile(new URL('quotes.json',folder),JSON.stringify(quotes,null,2)+'\n');
const prices=bills.map(b=>({id:b.id,geometryId:b.geometryId,number:b.number,model:b.model,size:b.size,rooms:b.roomCount,dimensionSha256:b.dimensionSha256,comfortCents:quotes.find(q=>q.billId===b.id&&q.package==='comfort').calculatedTotalCents,deluxeCents:quotes.find(q=>q.billId===b.id&&q.package==='deluxe').calculatedTotalCents}));
await fs.writeFile(new URL('prices.json',folder),JSON.stringify({version:catalog.version,publicationApproved:false,scope:'Bath, selected planning and priced equipment; exclusions are in each quote',prices},null,2)+'\n');
// Public package bases only: keep the private RRP and per-layout bills off the site.
const bases=Object.fromEntries(Object.entries(catalog.models).map(([model,row])=>[model,Object.fromEntries(Object.entries(row.sizes).map(([size,p])=>[size,{comfortCents:p.comfort.priceCents,deluxeCents:p.deluxe.priceCents}]))]));
await fs.writeFile(new URL('public-package-base.json',folder),JSON.stringify({version:catalog.version,source:'Google calculator · Цены и прибыль · 04.11.2026',models:bases},null,2)+'\n');
console.log(JSON.stringify({calculatedQuotes:quotes.length,complete:quotes.length-incomplete.length,geometryCount:new Set(quotes.map(q=>q.geometryId)).size,publicTotals:quotes.filter(q=>q.publicTotalCents!==null).length}));
