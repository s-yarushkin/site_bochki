// Loopback-only synthetic CRM. Never loads production credentials or delivers messages.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openLeadStore} from '../api/server/lead-store.mjs';
import {openCrmAccess} from '../api/server/crm-access.mjs';
import {hashManagerPassword} from '../api/server/manager-auth.mjs';
import {createCrmManagerApi} from '../api/server/crm-manager-api.mjs';
import {loadTestAPI,root} from './test-api.mjs';
const out=resolve(root,'.local/crm-speed-20261111'),file=resolve(out,'fixture-'+process.pid+'-'+randomUUID()+'.sqlite');
await mkdir(out,{recursive:true});const store=openLeadStore(file),crm=openCrmAccess(file);crm.migrate();
const accounts=[1,2].map(i=>({phone:'+7999000000'+i,hash:hashManagerPassword('Local-fixture-password-2026')}));const [o,m]=crm.seedLegacy({accounts,ownerPhone:accounts[0].phone});
const owner=crm.editUser(o.id,o.id,{name:'Сергей Ярушкин',active:true,roles:['owner_admin']}),yuri=crm.editUser(o.id,m.id,{name:'Юрий Ярушкин',active:true,roles:['manager']});
const {user:mikhail}=crm.createUser(o.id,{name:'Михаил Хапов',phone:'+79990000003',roles:['manager']});
const lead=store.create({flow:'callback',phone:'+79990000004',name:'Анна · пример',settlement:'Сокол',region:'Вологодская область',channel:'max',comment:'Нужна баня с душем к зиме',configuration:{selection:{model:'kvadro',size:'600',package:'deluxe'}},planRequest:{layoutId:'dp3d-05'},intentContext:{entry:'layout_quote',pagePath:'/',selection:{model:'kvadro',size:'600',package:'deluxe',layout:'dp3d-05'},sources:{model:'explicit',size:'explicit',layout:'explicit',package:'default'}},attribution:{last:{utm_source:'yandex',utm_medium:'cpc',utm_campaign:'blackfriday_search'}}},randomUUID()).lead;
store.delivery(lead.id,'delivered');store.workspace.update(lead.id,{assigneeUserId:yuri.id,status:'in_progress'},owner.id);store.workspace.append(lead.id,{clientId:randomUUID(),kind:'call',channel:'phone',body:'Обсудили участок и подъезд.\nКлиент просит прислать варианты с душем.'},yuri.id);
const second=store.create({flow:'callback',phone:'+79990000005',name:'Алексей · пример',settlement:'Ярославль',region:'Ярославская область',configuration:{selection:{model:'parus',size:'500',package:'comfort'}},intentContext:{entry:'site_capture',pagePath:'/'},attribution:{last:{utm_source:'vk'}}},randomUUID()).lead;
store.workspace.update(second.id,{assigneeUserId:mikhail.id,status:'quote_sent'},owner.id);
const {createRelayHandler,formatBaniLead}=await loadTestAPI(),deliveries=[];
const baseline=JSON.parse(await readFile(resolve(out,'baseline.json'))),build=JSON.parse(await readFile(resolve(out,'build.json')));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary'};
const pending=new Map();
async function publicFile(web,name){try{return await readFile(resolve(web,name));}catch{
 const a=build.aliases[name],source=a?.source??name,digest=a?.sha256??baseline.web_files[source];if(!digest)throw Error('Unknown public asset');
 if(!pending.has(name))pending.set(name,(async()=>{const response=await fetch('https://xn--80aaan1dh9b.xn--p1ai/'+source,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('Public asset unavailable');const data=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(data).digest('hex')!==digest)throw Error('Public asset changed');await mkdir(resolve(web,name,'..'),{recursive:true});await writeFile(resolve(web,name),data);return data;})().finally(()=>pending.delete(name)));
 return pending.get(name);
}}
for(const [port,folder]of [[4196,'candidate-web'],[4197,'preview-web']]){
 const origin='http://127.0.0.1:'+port,web=resolve(out,folder),auth={session:()=>({user:crm.user(owner.id),csrf:'local-only-fixture'}),validCsrf:req=>req.headers['x-csrf-token']==='local-only-fixture',logout:()=>''};
 const manager=createCrmManagerApi({crm,store,auth,origin}),relay=createRelayHandler({config:{allowedOrigin:origin,siteBasePath:'/'},store,deliver:async(lead,c,f,meta)=>deliveries.push({id:meta.id,text:formatBaniLead(lead,meta)})});
 createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);if(await manager(req,res))return;
  if(['/api/lead','/health'].includes(url.pathname))return relay(req,res);
  if(url.pathname==='/api/analytics/config'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({enabled:false,aggregate_enabled:false}));return;}
  if(url.pathname==='/_test/receipts'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({deliveries,leads:store.list().leads}));return;}
  if(url.pathname==='/data/site-settings.json'){const settings=JSON.parse(await readFile(resolve(web,'data/site-settings.json')));settings.analytics.enabled=false;settings.productionOrigin=origin;settings.lead.allowedOrigins=[origin];res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(settings));return;}
  let name=decodeURIComponent(url.pathname).slice(1)||'index.html',p=resolve(web,name);if(!p.startsWith(web+sep))throw Error('Outside static root');try{if((await stat(p)).isDirectory())name=name.replace(/\/$/,'')+'/index.html';}catch{}
  const data=await publicFile(web,name);res.writeHead(200,{'Content-Type':mime[extname(name)]??'application/octet-stream','Cache-Control':/^assets\/(fast|build)\//.test(name)?'public, max-age=31536000, immutable':'no-store'});res.end(data);
 }catch(e){console.error('FIXTURE',req.url,e.message);res.writeHead(404);res.end('Local fixture: not found');}}).listen(port,'127.0.0.1',()=>console.log('LOCAL ONLY '+origin+' '+folder+' — synthetic clients, no MAX credentials, no external delivery.'));
}
