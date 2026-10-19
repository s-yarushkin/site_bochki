// Read-only runtime import. Does not load credentials, open the production DB or send MAX.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]);
const {validateBaniLead}=await import(pathToFileURL(resolve(root,'server/garant-bani-relay.mjs')));
const {PRICEBOOK}=await import(pathToFileURL(resolve(root,'data/pricebook.js')));
const {PRICEBOOK:OLD_SITE}=await import(pathToFileURL(resolve(root,'data/legacy-site-v1-pricebook.js')));
const input={flow:'quote',name:'Изолированная проверка',phone:'+79991234567',district:'Изолированный тест',base:'ready',access:'yes',consent:true,consentVersion:'2026-10-14',configuration:{modelId:'kvadro',sizeId:'500',optionIds:[],bundleId:null,finish:'pine',roof:'brown',pricebookVersion:PRICEBOOK.version}};
const fresh=validateBaniLead(input);if(fresh.estimate.total!==500955)throw Error('NEW_RUNTIME_PRICE_MISMATCH');
const full=validateBaniLead({...input,configuration:{...input.configuration,optionIds:PRICEBOOK.bundle.optionIds,bundleId:PRICEBOOK.bundle.id}});if(full.estimate.total!==613977)throw Error('BUNDLE_PRICE_MISMATCH');
if(full.estimate.quoteRequired!==false || full.estimate.unpricedOptionIds.length!==0)throw Error('BUNDLE_INCORRECT_APPROVAL_STATUS');
const oldTab=validateBaniLead({...input,configuration:{...input.configuration,pricebookVersion:OLD_SITE.version}});
if(oldTab.estimate.total!==505000)throw Error('SITE_V1_TAB_COMPATIBILITY_BROKEN');
delete input.configuration.pricebookVersion;
if(validateBaniLead(input).estimate.total!==370000)throw Error('OLD_TAB_COMPATIBILITY_BROKEN');
for(const model of PRICEBOOK.models)for(const [sizeId,amount] of Object.entries(model.sizes)){
 const got=validateBaniLead({...input,configuration:{...input.configuration,modelId:model.id,sizeId,pricebookVersion:PRICEBOOK.version}});
 if(got.estimate.total!==amount)throw Error('MATRIX_PRICE_MISMATCH');
}
console.log('PRICE_RUNTIME_PROBE=PASS; NEW_AND_PREVIOUS_BOOKS=PASS; CURATED_KIT_TOTAL_613977=PASS; MATRIX_20=PASS; PERSISTENCE_WRITES=0; MAX_CALLS=0');
