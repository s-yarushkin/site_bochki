/* Route old plan links into the dedicated gallery before a model page renders. */
(function(root){
 'use strict';
 const models=new Set(['kvadro','viking','parus','kvadro-house','all']);
 const modelPages={kvadro:'kvadro',viking:'viking',parus:'parus','kvadro-haus':'kvadro-house'};
 function galleryRoute(value){
  const u=new URL(value,'https://xn--80aaan1dh9b.xn--p1ai'),q=u.searchParams;
  if(u.pathname==='/planirovki/')return null;
  const match=u.pathname.match(/^\/bani\/(kvadro|viking|parus|kvadro-haus)\/?$/);
  const oldHash={'#parus-layouts':'parus','#qh-layouts':'kvadro-house','#kvadro-layouts':'kvadro'}[u.hash];
  const entry=Boolean(oldHash||q.has('planModel')||q.has('planSize')||q.has('viewPlan')||q.has('viewMirror')||(match&&u.hash==='#plans'));
  if(!entry)return null;
  const dest=new URL('/planirovki/',u.origin),model=models.has(q.get('planModel'))?q.get('planModel'):oldHash||(match?modelPages[match[1]]:'all');
  if(model!=='all')dest.searchParams.set('model',model);
  const size=q.get('planSize');if(size&&size!=='all'&&/^[0-9x.]{1,18}$/.test(size))dest.searchParams.set('size',size);
  const id=q.get('viewPlan');if(id&&/^[a-zA-Z0-9_-]{1,90}$/.test(id))dest.searchParams.set('plan',id);
  if(id&&q.get('viewMirror')==='1')dest.searchParams.set('mirror','1');
  for(const name of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid']){const value=q.get(name);if(value&&/^[a-zA-Z0-9а-яА-ЯёЁ _.:+\-/(),]{1,180}$/.test(value))dest.searchParams.set(name,value)}
  return dest.pathname+dest.search;
 }
 root.DachaParPlanRoute=galleryRoute;
 if(root.location&&root.location.replace){const dest=galleryRoute(root.location.href);if(dest)root.location.replace(dest)}
})(globalThis);
