import {cpSync,existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export const root=fileURLToPath(new URL('../',import.meta.url));
export async function loadTestAPI(){
 const original=resolve(root,'.local/api-baseline'),target=resolve(root,'.local/api-test');
 if(!existsSync(original))throw Error('Private owner API baseline is required in .local/api-baseline. Never use production credentials for tests.');
 mkdirSync(target,{recursive:true});cpSync(original,target,{recursive:true});cpSync(resolve(root,'api'),target,{recursive:true});writeFileSync(resolve(target,'package.json'),'{"type":"module"}');
 // The historical deploy renamed the R85 export. Reproduce that local-only alias.
 const historic=resolve(target,'server/r85-public-pricebook-previous.mjs');let source=readFileSync(historic,'utf8');if(!source.includes('as PREVIOUS_R85_BOOK'))writeFileSync(historic,source+'\nexport {PUBLIC_R85_BOOK as PREVIOUS_R85_BOOK};\n');
 return {...await import(pathToFileURL(resolve(target,'server/garant-bani-relay.mjs'))),...await import(pathToFileURL(resolve(target,'server/lead-store.mjs')))};
}
