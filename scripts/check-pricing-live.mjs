/** A live Google Sheets export is mandatory for the explicit release price-parity check. */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const input=process.argv[2]||process.env.DACHAPAR_LIVE_PRICE_EXPORT;
if(!input){
  process.stderr.write('LIVE_PRICING_EXPORT_REQUIRED: pass JSON exported from current Google Sheet (20 Comfort and 41 quiz rows).\n');
  process.stderr.write('Usage: npm run test:pricing:live -- /path/to/fresh-live-price-export.json\n');
  process.exit(2);
}
const file=resolve(input);
if(!existsSync(file)){
  process.stderr.write('LIVE_PRICING_EXPORT_NOT_FOUND: '+file+'\n');
  process.exit(2);
}
const result=spawnSync(process.execPath,['--test','tests/pricing-parity.test.mjs'],{
  cwd:root,
  env:{...process.env,DACHAPAR_LIVE_PRICE_EXPORT:file},
  stdio:'inherit'
});
if(result.error)throw result.error;
process.exit(result.status===null?1:result.status);
