import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {quoteLayout} from './layout-pricing.mjs';
const directory=new URL('../../output/layout-pricing-review/',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',directory)));
const bills=JSON.parse(await fs.readFile(new URL('bills.json',directory)));
const quotes=bills.flatMap(bill=>['comfort','deluxe'].map(pack=>({billId:bill.id,...quoteLayout(catalog,bill,pack)})));
await fs.writeFile(new URL('quotes.json',directory),JSON.stringify(quotes,null,2));
console.log(JSON.stringify({directory:fileURLToPath(directory),draftQuotes:quotes.length,publishedTotals:quotes.filter(q=>q.publicTotalCents!==null).length}));
