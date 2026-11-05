import {crmAnswer,crmJson} from './crm-manager-api.mjs';
export function createCrmPublicApi({insights,origin,clock=()=>Date.now()}){
 const buckets=new Map();
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/go/')&&!url.pathname.startsWith('/api/analytics/'))return false;
  if(req.headers.host!==new URL(origin).host){crmAnswer(res,403,{ok:false,code:'HOST_FORBIDDEN'});return true;}
  if(url.pathname.startsWith('/go/')){
   if(req.method!=='GET'){crmAnswer(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});return true;}
   const staff=String(req.headers.cookie??'').split(';').some(s=>s.trim()==='dp_staff=1');
   const slug=url.pathname.slice(4);let destination=/^[a-z][a-z0-9_-]{1,80}$/.test(slug)?insights.redirect(slug,String(req.headers['user-agent']??'').slice(0,300),{staff}):null;
   if(!destination){crmAnswer(res,404,{ok:false,code:'NOT_FOUND'});return true;}
   const target=new URL(destination);for(const key of ['yclid','gclid']){const value=url.searchParams.get(key);if(value&&/^[A-Za-z0-9_-]{1,150}$/.test(value))target.searchParams.set(key,value);}destination=target.href;
   res.writeHead(302,{'Location':destination,'Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Robots-Tag':'noindex'});res.end();return true;
  }
  if(!url.pathname.startsWith('/api/analytics/'))return false;
  if(url.pathname==='/api/analytics/config'&&req.method==='GET'){
   crmAnswer(res,200,{ok:true,enabled:insights.enabled,consent_version:'crm-cookies-20261105',retention_days:180});return true;
  }
  if(req.method!=='POST'||req.headers.origin!==origin){crmAnswer(res,403,{ok:false,code:'ORIGIN_FORBIDDEN'});return true;}
  const key=String(req.headers['x-forwarded-for']??'').split(',').at(-1)?.trim()||req.socket.remoteAddress||'unknown',now=clock();
  for(const [k,b] of buckets)if(now-b.at>60000)buckets.delete(k);
  const bucket=buckets.get(key)??{at:now,count:0};if(bucket.count>=40||buckets.size>5000){crmAnswer(res,429,{ok:false,code:'RATE_LIMITED'});return true;}bucket.count++;buckets.set(key,bucket);
  try{
   const data=await crmJson(req,24000);
   if(url.pathname==='/api/analytics/consent'){
    if(!['all','necessary'].includes(data.choice))throw Error('INVALID_CONSENT');
    crmAnswer(res,200,{ok:true,choice:data.choice},{'Set-Cookie':insights.consent(req,data.choice==='all')});return true;
   }
   if(!insights.enabled&&url.pathname!=='/api/analytics/source-context'){crmAnswer(res,200,{ok:true,accepted:0,disabled:true});return true;}
   const staff=String(req.headers.cookie??'').split(';').some(s=>s.trim()==='dp_staff=1');
   if(url.pathname==='/api/analytics/events/batch'){crmAnswer(res,200,{ok:true,...(staff?{accepted:0,staffExcluded:true}:insights.events(req,data))});return true;}
   if(url.pathname==='/api/analytics/source-context'){crmAnswer(res,200,{ok:true,context:insights.signedSource(data)});return true;}
   crmAnswer(res,404,{ok:false,code:'NOT_FOUND'});return true;
  }catch(error){const code=error.message;crmAnswer(res,['INVALID_CONSENT','INVALID_EVENTS','INVALID_JSON','BODY_TOO_LARGE','JSON_REQUIRED'].includes(code)?400:503,{ok:false,code:['INVALID_CONSENT','INVALID_EVENTS','INVALID_JSON','BODY_TOO_LARGE','JSON_REQUIRED'].includes(code)?code:'ANALYTICS_UNAVAILABLE'});return true;}
 };
}
