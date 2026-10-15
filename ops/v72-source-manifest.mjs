import {readdirSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [directory,sourceSha]=process.argv.slice(2);
if(!directory||!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('EXACT_SOURCE_SHA_REQUIRED');
const root=resolve(directory),files={};
function walk(relative=''){
  for(const name of readdirSync(join(root,relative))){
    const path=join(relative,name), stat=lstatSync(join(root,path));
    if(stat.isSymbolicLink())throw Error('SYMLINK_SOURCE_FORBIDDEN');
    if(stat.isDirectory())walk(path);
    else if(stat.isFile() && name!=='V72-INSTALL-MANIFEST.json')files[path.replaceAll('\\','/')]=createHash('sha256').update(readFileSync(join(root,path))).digest('hex');
    else throw Error('UNEXPECTED_SOURCE_ENTRY');
  }
}
walk();writeFileSync(join(root,'V72-INSTALL-MANIFEST.json'),JSON.stringify({sourceSha,files},null,2)+'\n');
console.log('SOURCE_MANIFEST=PASS; FILES='+Object.keys(files).length);
