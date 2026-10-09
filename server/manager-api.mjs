import {URL} from 'node:url';

function answer(res,status,data,extra={}) {
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, private',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    ...extra
  });
  res.end(JSON.stringify(data));
}
async function readJson(req){
  let total=0;
  const parts=[];
  for await(const part of req){
    total+=part.length;
    if(total>6000)throw new Error('BODY_TOO_LARGE');
    parts.push(part);
  }
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}
  catch{throw new Error('INVALID_JSON');}
}
const safeId=id=>/^GB-\d{8}-[A-F0-9]{8}$/.test(id);
const clientIp=req=>String(req.headers['x-forwarded-for']||'').split(',').at(-1)?.trim()||req.socket.remoteAddress||'unknown';

export function createManagerApi({store,auth,origin,log=()=>{}}){
  if(!store||!auth||!origin)throw new Error('MANAGER_API_CONFIG_REQUIRED');
  return async function managerApi(req,res){
    const url=new URL(req.url,'http://localhost');
    const path=url.pathname;
    if(!path.startsWith('/api/manager/'))return false;
    const modifying=!['GET','HEAD'].includes(req.method);
    if(modifying && req.headers.origin!==origin){
      answer(res,403,{ok:false,code:'ORIGIN_FORBIDDEN'});return true;
    }
    try{
      if(path==='/api/manager/login'&&req.method==='POST'){
        if(!String(req.headers['content-type']||'').startsWith('application/json')){
          answer(res,415,{ok:false,code:'JSON_REQUIRED'});return true;
        }
        const body=await readJson(req);
        const result=auth.login(body?.password,clientIp(req));
        if(!result.ok){
          answer(res,result.limited?429:401,{ok:false,code:result.limited?'RATE_LIMITED':'INVALID_CREDENTIALS'});
          return true;
        }
        log(JSON.stringify({event:'bani_manager_login'}));
        answer(res,200,{ok:true},{'Set-Cookie':result.cookie});return true;
      }
      if(!auth.authenticated(req)){
        answer(res,401,{ok:false,code:'LOGIN_REQUIRED'});return true;
      }
      if(path==='/api/manager/session'&&req.method==='GET'){
        answer(res,200,{ok:true,role:'manager'});return true;
      }
      if(path==='/api/manager/logout'&&req.method==='POST'){
        answer(res,200,{ok:true},{'Set-Cookie':auth.logoutCookie()});return true;
      }
      if(path==='/api/manager/leads'&&req.method==='GET'){
        const limit=Number(url.searchParams.get('limit')||50);
        const offset=Number(url.searchParams.get('offset')||0);
        const result=store.list({
          status:url.searchParams.get('status')||'all',
          q:url.searchParams.get('q')||'',limit,offset
        });
        answer(res,200,{ok:true,...result,stats:store.stats()});return true;
      }
      const match=/^\/api\/manager\/leads\/(GB-\d{8}-[A-F0-9]{8})$/.exec(path);
      if(match){
        const id=match[1];
        if(!safeId(id)){answer(res,404,{ok:false,code:'NOT_FOUND'});return true;}
        if(req.method==='GET'){
          const lead=store.detail(id);
          answer(res,lead?200:404,lead?{ok:true,lead}:{ok:false,code:'NOT_FOUND'});return true;
        }
        if(req.method==='PATCH'){
          if(!String(req.headers['content-type']||'').startsWith('application/json')){
            answer(res,415,{ok:false,code:'JSON_REQUIRED'});return true;
          }
          const body=await readJson(req);
          if(!body||typeof body!=='object'||Array.isArray(body)||
             !['status','assignee','managerNote'].every(k=>Object.hasOwn(body,k))){
            answer(res,400,{ok:false,code:'FIELDS_REQUIRED'});return true;
          }
          const lead=store.update(id,{
            status:body.status,assignee:body.assignee,managerNote:body.managerNote
          });
          answer(res,lead?200:404,lead?{ok:true,lead}:{ok:false,code:'NOT_FOUND'});
          if(lead)log(JSON.stringify({event:'bani_manager_updated',leadId:id}));
          return true;
        }
      }
      answer(res,404,{ok:false,code:'NOT_FOUND'});return true;
    }catch(error){
      const code=['INVALID_STATUS','INVALID_PAGINATION','INVALID_TEXT','TEXT_TOO_LONG','INVALID_JSON','BODY_TOO_LARGE'].includes(error.message)?
        error.message:'REQUEST_FAILED';
      answer(res,code==='REQUEST_FAILED'?500:400,{ok:false,code});
      log(JSON.stringify({event:'bani_manager_error',code}));
      return true;
    }
  };
}
