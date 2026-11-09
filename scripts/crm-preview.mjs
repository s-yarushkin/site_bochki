// Isolated fixture server. Never reads production accounts, credentials or database.
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {loadTestAPI} from './test-api.mjs';import {openCrmAccess} from '../api/server/crm-access.mjs';import {openCrmInsights} from '../api/server/crm-insights.mjs';import {createCrmPublicApi} from '../api/server/crm-public-api.mjs';import {hashManagerPassword} from '../api/server/manager-auth.mjs';
import {openCrmMfa} from '../api/server/crm-mfa.mjs';
import {openAggregateCounters} from '../api/server/crm-aggregate.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),web=path.join(root,'web');
const port=Number(process.env.CRM_PREVIEW_PORT??4199),origin=process.env.CRM_PREVIEW_ORIGIN??'http://127.0.0.1:'+port,prefix=process.env.CRM_PREVIEW_PREFIX??'';
if(prefix&&!/^\/crm-stage-[a-f0-9]{12}$/.test(prefix))throw Error('Invalid stage prefix');
const folder=path.join(root,'.local/crm-preview',randomUUID());await fs.mkdir(folder,{recursive:true});const database=path.join(folder,'fixture.sqlite');
const {openLeadStore,createRelayHandler,createSiteManagerApi}=await loadTestAPI(),store=openLeadStore(database),crm=openCrmAccess(database);crm.migrate();
const password='Fixture-password-2026!',accounts=[{phone:'+79990000001',hash:hashManagerPassword(password)},{phone:'+79990000002',hash:hashManagerPassword(password)}],sessionSecret='f'.repeat(64);
const [owner,manager]=crm.seedLegacy({accounts,ownerPhone:accounts[0].phone});
const mfa=process.env.CRM_PREVIEW_MFA==='1'?openCrmMfa(database,{secret:sessionSecret}):null;const activations={};if(mfa){mfa.migrate();for(const user of [owner,manager])activations[user.phone_e164]=mfa.issueInvite(owner.id,user.id).activationCode;}
const insights=openCrmInsights(database,{secret:sessionSecret,origin});insights.migrate();
const aggregate=openAggregateCounters(database,{enabled:true});aggregate.migrate();
for(const [i,name]of ['Тест: Квадро','Тест: Парус'].entries()){const lead=store.create({flow:'callback',name,phone:'+7999000000'+(i+3),contactChannel:'max',comment:'Изолированная тестовая заявка'},randomUUID()).lead;store.delivery(lead.id,'delivered');}
const config={allowedOrigin:origin,siteBasePath:prefix+'/',sites:[{origin,basePath:prefix+'/'}]};
const managerApi=createSiteManagerApi({config,store,managerConfig:{accounts,sessionSecret},crm,insights,mfa,aggregate,log:()=>{}}),publicApi=createCrmPublicApi({insights,origin,aggregate});
const relay=createRelayHandler({config,store,managerApi,publicApi,insights,deliver:async()=>{},log:()=>{}});
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
function rewrite(data){if(!prefix)return data;return data.replaceAll('gb_manager_session','crmstage_gb_manager_session').replaceAll('dp_manager_challenge','crmstage_dp_manager_challenge').replaceAll('dp_visitor','crmstage_dp_visitor').replaceAll('dp_consent','crmstage_dp_consent').replaceAll('dp_staff','crmstage_dp_staff').replaceAll("'/api/",`'${prefix}/api/`).replaceAll("'/journey-tracker.css",`'${prefix}/journey-tracker.css`).replaceAll("'/privacy.html'",`'${prefix}/privacy.html'`).replaceAll('Path=/;',`Path=${prefix}/;`);}
const fixture=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Изолированный тест аналитики</title><body><h1>Тестовая страница: данные вымышленные, MAX отключён</h1><button data-model-card="kvadro">Квадро</button><button data-size-picker="450">4,5 м</button><button data-plan-request>Получить предложение</button><p id="result"></p><a href="${prefix}/manager.html">Тестовый кабинет</a><script type="module">
import {analytics} from '${prefix}/analytics-core.mjs';import {buildCallback,submitLead} from '${prefix}/lead-client.mjs';
analytics.start({productionOrigin:location.origin,analytics:{enabled:false}});
document.querySelector('[data-plan-request]').onclick=()=>{const d=document.createElement('dialog');d.innerHTML='<h2>Тестовая форма</h2><form><label>Телефон<input name="phone" value="+79990000009" type="tel" required></label><button>Отправить тестовую заявку</button></form><button data-close>Закрыть</button>';document.body.append(d);d.showModal();d.querySelector('[data-close]').onclick=()=>d.close();d.querySelector('form').onsubmit=async e=>{e.preventDefault();const p=buildCallback({phone:d.querySelector('input').value},crypto.randomUUID());p.purpose='quiz_catalog';p.contactChannel='max';try{await submitLead(p,{lead:{enabled:true,endpoint:'${prefix}/api/lead',allowedOrigins:[location.origin]}},location.origin);document.querySelector('#result').textContent='Тестовая заявка сохранена; реального MAX не было';d.close();}catch(err){document.querySelector('#result').textContent=err.message;}};};
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
 const write=res.writeHead.bind(res);res.writeHead=(status,headers={})=>{
  const key=Object.keys(headers).find(k=>k.toLowerCase()==='set-cookie');if(key){let cookies=[headers[key]].flat().map(c=>prefix?c.replace(/^(gb_manager_session|dp_manager_challenge|dp_visitor|dp_consent|dp_staff)=/,'crmstage_$1=').replace(/Path=[^;]+/,value=>value.startsWith('Path='+prefix+'/')?value:'Path='+prefix+'/'):c);if(!prefix)cookies=cookies.map(c=>c.replace(/; Secure/g,''));headers[key]=cookies;}
  if(prefix&&headers.Location){const dest=new URL(headers.Location,origin);if(dest.origin!==origin)throw Error('Stage redirect outside origin');if(!dest.pathname.startsWith(prefix+'/'))dest.pathname=prefix+dest.pathname;headers.Location=dest.href;}
  return write(status,headers);
 };
 const end=res.end.bind(res);res.end=(data,...args)=>{if(prefix&&typeof data==='string'&&data.startsWith('{'))data=data.replaceAll('"short_url":"'+origin+'/','"short_url":"'+origin+prefix+'/').replaceAll('"full_url":"'+origin+'/','"full_url":"'+origin+prefix+'/');return end(data,...args);};
 try{
  if(prefix)req.headers.cookie=String(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('crmstage_')).map(s=>s.replace(/^crmstage_/, '')).join('; ');
  const url=new URL(req.url,origin);if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/go/')||url.pathname==='/health'){await relay(req,res);return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/__fixture/reset'){res.writeHead(303,{'Location':prefix+'/fixture.html','Set-Cookie':['dp_visitor','dp_consent','dp_staff'].map(n=>n+'=; Max-Age=0; Path=/; Secure; SameSite=Lax')});res.end();return;}
  if(url.pathname==='/'||url.pathname==='/fixture.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(rewrite(fixture));return;}
  const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(web+path.sep)||!types[path.extname(file)])throw Error('NOT_FOUND');const binary=types[path.extname(file)].startsWith('image/');let data=await fs.readFile(file,binary?undefined:'utf8');
  if(file.endsWith(path.sep+'manager.html'))data=data.replace('<body>','<body><p class="crm-fixture-warning">Изолированный тестовый кабинет. Все заявки вымышленные, реальный MAX отключён.</p>');
  if(!binary)data=rewrite(data);res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});res.end(data);
 }catch{res.writeHead(404);res.end('Fixture resource unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:origin+prefix+'/manager.html',fixture:origin+prefix+'/fixture.html',owner:accounts[0].phone,manager:accounts[1].phone,password,activations,productionData:false,realMaxMessages:0})));
