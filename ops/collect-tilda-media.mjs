#!/usr/bin/env node
/**
 * Read-only local inventory of public Tilda image links.
 * No images are downloaded or committed; no personal data is collected.
 * Usage: node ops/collect-tilda-media.mjs [--out /path/to/candidates.json]
 */
import {writeFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {discoverTildaPages} from './tilda-photo-discovery.mjs';

export async function main(args=process.argv.slice(2),run=discoverTildaPages){
  let output=join(tmpdir(),'garant-bani-tilda-media-candidates.json');
  if(args.length){
    if(args.length!==2||args[0]!=='--out'||!args[1]||args[1].startsWith('-'))
      throw new Error('USAGE: node ops/collect-tilda-media.mjs [--out /path/to/file.json]');
    output=resolve(args[1]);
  }
  const audit=await run();
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(audit,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'w'});
  console.log('TILDA_AUDIT_FILE='+output);
  console.log('PAGES_SUCCEEDED='+audit.records.length);
  console.log('PAGES_FAILED='+audit.errors.length);
  console.log('PHOTO_CANDIDATES='+audit.count);
  console.log('PUBLICATION_APPROVED=NO');
  if(!audit.records.length)throw new Error('TILDA_PAGES_UNAVAILABLE');
  return audit;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  main().catch(error=>{
    console.error('TILDA_AUDIT_FAILED='+String(error.message||error));
    process.exitCode=1;
  });
}
