// Does not open production SQLite or load MAX credentials.
import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
const root=resolve(process.argv[2]);
const {validateBaniLead}=await import(pathToFileURL(resolve(root,'server/garant-bani-relay.mjs')));
const {CONSENT_VERSION,CONSENT_METHOD}=await import(pathToFileURL(resolve(root,'assets/js/lead-consent.js')));
const input={flow:'quote',name:'',phone:'+79991234567',district:'',base:'unknown',access:'unknown',consent:true,consentVersion:CONSENT_VERSION,consentMethod:CONSENT_METHOD,configuration:{modelId:'kvadro',sizeId:'500',optionIds:[],bundleId:null,pricebookVersion:'2026-10-16-sheet-site-v1'}};
const result=validateBaniLead(input);
if(result.estimate.total!==505000||result.consentEvidence.method!==CONSENT_METHOD||result.consentEvidence.version!==CONSENT_VERSION||!result.consentEvidence.documentSha256)throw Error('CONVERSION_CONTRACT_MISMATCH');
let refused=false;try{validateBaniLead({...input,consentMethod:undefined});}catch{refused=true;}
if(!refused)throw Error('MISSING_CONSENT_EVIDENCE_NOT_REJECTED');
console.log('CONVERSION_RUNTIME_PROBE=PASS; PHONE_ONLY=PASS; CONSENT_EVIDENCE=PASS; PRODUCTION_WRITES=0; MAX_CALLS=0');
