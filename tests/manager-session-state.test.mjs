import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';

const frontend=readFileSync(new URL('../assets/js/manager.js',import.meta.url),'utf8');

function fakeElement(id=''){
  return {
    id,textContent:'',hidden:false,value:'',disabled:false,dataset:{},
    children:[],listeners:{},attributes:{},
    replaceChildren(...items){this.children=[...items];},
    append(...items){this.children.push(...items);},
    setAttribute(k,v){this.attributes[k]=v;},
    addEventListener(k,fn){this.listeners[k]=fn;},
    scrollIntoView(){},
    replaceWith(other){this.__bySelector.set('#'+this.id,other);}
  };
}
test('manager session boundary clears old details and two actual PATCH receipts change the same lead',async()=>{
  const els=new Map();
  const mk=id=>{
    const e=fakeElement(id);
    e.__bySelector=els;
    return e;
  };
  const document={
    baseURI:'https://example.org/bani-preview/manager.html',
    querySelector(s){
      if(!els.has(s))els.set(s,mk(s.startsWith('#')?s.slice(1):s));
      return els.get(s);
    },
    querySelectorAll(){return [];},
    createElement(tag){return mk(tag)}
  };
  const first='+79991112233',second='+79992223344';
  let record={
    id:'GB-20261009-AABBCCDD',createdAt:'2026-10-09T12:00:00Z',
    flow:'quote',status:'new',assignee:'',managerNote:'',notificationStatus:'delivered',
    detail:{
      name:'Test customer',phone:'+79991112233',contactChannel:'phone',
      district:'Vologda',base:'unknown',access:'yes',comment:'',
      configuration:{finishName:'Natural'},
      estimate:{modelName:'Kv',sizeId:'500',options:[],basePrice:100,
        optionsSubtotal:0,discount:0,total:100,pricebookVersion:'v1',pricebookStatus:'DEMO_ONLY'}
    },events:[]
  };
  const edits=[];
  const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
  const fetch=async(url,opts={})=>{
    if(url.endsWith('/session'))return response(401,{ok:false,code:'LOGIN_REQUIRED'});
    if(url.includes('/leads?')){
      return response(200,{
        ok:true,leads:[record],total:1,limit:30,offset:0,
        stats:{total:1,byStatus:{new:1,in_progress:0,awaiting_customer:0,quote_sent:0,won:0,lost:0}}
      });
    }
    if(url.endsWith('/'+record.id)&&opts.method==='PATCH'){
      const p=JSON.parse(opts.body);
      edits.push(p);
      record={...record,status:p.status,assignee:p.assignee,managerNote:p.managerNote};
      return response(200,{ok:true,lead:record});
    }
    if(url.endsWith('/'+record.id))return response(200,{ok:true,lead:record});
    return response(404,{ok:false});
  };
  class FakeURL{
    constructor(path,base){this.href=base.slice(0,base.lastIndexOf('/')+1)+path;}
    toString(){return this.href;}
  }
  class FakeQuery{
    constructor(entries){this.entries=entries;}
    toString(){return Object.entries(this.entries).map(([k,v])=>k+'='+v).join('&');}
  }
  const context=createContext({
    document,window:{matchMedia:()=>({matches:false})},fetch,
    URL:FakeURL,URLSearchParams:FakeQuery
  });
  new Script(frontend+'\n;globalThis.__test={showLogin,showDashboard,loadDetail,save,state};').runInContext(context);
  // Let the mocked initial anonymous session rejection complete before login.
  for(let i=0;i<15;i++)await Promise.resolve();
  const app=context.__test;
  app.showDashboard(first);
  await app.loadDetail(record.id);
  assert.equal(app.state.selected,record.id);
  document.querySelector('#editStatus').value='in_progress';
  document.querySelector('#editAssignee').value='Manager A';
  document.querySelector('#editNote').value='Called';
  await app.save({preventDefault(){}});
  assert.equal(record.status,'in_progress');
  assert.equal(document.querySelector('#saveStatus').textContent,'Изменения сохранены.');
  assert.equal(edits.length,1);
  app.showLogin();
  assert.equal(app.state.selected,null);
  assert.equal(document.querySelector('#leadDetail').hidden,true);
  assert.equal(document.querySelector('#saveStatus').textContent,'');
  assert.equal(document.querySelector('#leadName').textContent,'');
  assert.equal(document.querySelector('#leadsList').children.length,0);
  app.showDashboard(second);
  assert.equal(document.querySelector('#activeManager').textContent,second);
  await app.loadDetail(record.id);
  assert.equal(document.querySelector('#editStatus').value,'in_progress');
  document.querySelector('#editStatus').value='quote_sent';
  await app.save({preventDefault(){}});
  assert.equal(record.status,'quote_sent');
  assert.equal(edits.length,2);
  assert.equal(edits[1].status,'quote_sent');
  assert.equal(document.querySelector('#saveStatus').textContent,'Изменения сохранены.');
});
