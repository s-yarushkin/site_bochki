/**
 * Garant Bani V5: read-only candidate photo discovery from the customer's
 * publicly accessible Tilda pages. A candidate is NOT a licensed/verified
 * model photo; publish only after rights + identity + owner approval.
 */
const SOURCE_HOST='static.tildacdn.com';
const IMAGE_FILE=/\.(?:jpe?g|png|webp|avif|gif)(?:$|[?#])/i;
// In this workflow we only inventory the original static.tildacdn.com host.
// Resized thb.tildacdn.com assets (including /-/resizeb/20x/)
// are derivative previews, not additional product photographs.

export const TILDA_PAGES=Object.freeze([
  {id:'home',url:'https://www.garant-bany.ru/'},
  {id:'kvadro',url:'https://www.garant-bany.ru/catalog_kvadro'},
  {id:'parus',url:'https://www.garant-bany.ru/catalog_parus'},
  {id:'viking',url:'https://www.garant-bany.ru/catalog_viking'},
  // This is the actual address linked by Tilda, including its unusual spelling.
  {id:'kvadro-house',url:'https://www.garant-bany.ru/catalog_kvadro_hauos'}
]);

function normalizeCandidate(raw){
  if(typeof raw!=='string')return null;
  const cleaned=raw.replace(/&amp;/g,'&').replace(/\\\//g,'/').replace(/^\/\//,'https://')
    .replace(/[),;]+$/,'');
  try{
    const url=new URL(cleaned);
    if(url.protocol!=='https:'||url.hostname.toLowerCase()!==SOURCE_HOST)return null;
    if(!IMAGE_FILE.test(url.pathname))return null;
    url.hash='';
    // Retain query parameters as part of the factual observed source.
    return url.toString();
  }catch{return null;}
}

export function extractTildaPhotoCandidates(html,pageId='unknown'){
  if(typeof html!=='string')throw new TypeError('TILDA_HTML_STRING_REQUIRED');
  // Real Tilda pages embed image addresses in data-original, data-bgimg,
  // style, srcset and JSON, so scan raw markup rather than just <img src>.
  const normalized=html.replace(/\\\//g,'/').replace(/&quot;/g,'"');
  const pattern=/(?:https?:)?\/\/(?:static|thb|thumb)\.tildacdn\.com\/[a-zA-Z0-9_/%+.,;=?!&\-]+/g;
  const unique=new Map();
  for(const [raw] of normalized.matchAll(pattern)){
    const url=normalizeCandidate(raw);
    if(!url)continue;
    // Deduplicate by exact URL of the original static.tildacdn.com asset.
    if(!unique.has(url))unique.set(url,{
      sourcePageId:pageId,sourceUrl:url,rights:'UNVERIFIED',
      model:'UNVERIFIED',status:'DISCOVERED',publishable:false
    });
  }
  return [...unique.values()].sort((a,b)=>a.sourceUrl.localeCompare(b.sourceUrl));
}

export async function discoverTildaPages({fetchImpl=fetch,pages=TILDA_PAGES}={}){
  const records=[],errors=[];
  for(const page of pages){
    try{
      const url=new URL(page.url);
      if(url.protocol!=='https:'||url.hostname!=='www.garant-bany.ru')
        throw new Error('OUT_OF_SCOPE_SOURCE_HOST');
      const response=await fetchImpl(url,{signal:AbortSignal.timeout(15000),
        headers:{'User-Agent':'GarantBaniMediaAudit/1.0 (+read-only owner review)'}});
      if(!response.ok)throw new Error('HTTP_'+response.status);
      const html=await response.text();
      const matches=extractTildaPhotoCandidates(html,page.id);
      records.push({id:page.id,sourcePage:url.href,count:matches.length,candidates:matches});
    }catch(error){
      errors.push({id:page.id,sourcePage:page.url,reason:String(error?.message||'FETCH_FAILED')});
    }
  }
  return {schemaVersion:1,kind:'TILDA_CANDIDATE_AUDIT_NOT_PUBLISH_APPROVAL',
    checkedAt:new Date().toISOString(),records,errors,
    count:records.reduce((total,item)=>total+item.count,0)};
}
