import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mobileDialog} from '../r101/mobile-dialog.mjs';

function setup(mobile=true){
 const events={},props=new Map();let queued;
 const viewport={height:740,offsetTop:0,addEventListener(n,fn){events[n]=fn}};
 const media={matches:mobile,addEventListener(n,fn){events.media=fn}};
 const dialog={open:true,scrollTop:0,style:{setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)},
  contains:el=>el===doc.activeElement,matches:()=>false,
  getBoundingClientRect:()=>({top:viewport.offsetTop+8,bottom:viewport.offsetTop+viewport.height-8}),
  addEventListener:(n,fn)=>events[n]=fn,setAttribute(){},focus(){doc.activeElement=dialog}};
 const doc={activeElement:null};
 const win={visualViewport:viewport,innerHeight:740,matchMedia:()=>media,addEventListener(){},requestAnimationFrame(fn){queued=fn;return 1}};
 const controller=mobileDialog(dialog,win,doc);
 return {dialog,doc,viewport,props,controller,events,flush(){queued?.();queued=null},media};
}
test('keyboard resize and viewport pan keep the mobile dialog inside visible bounds and reveal the focused field',()=>{
 const t=setup();assert.equal(t.controller.open(),true);assert.equal(t.doc.activeElement,t.dialog);
 t.doc.activeElement={matches:()=>true,getBoundingClientRect:()=>({top:600,bottom:650})};
 t.viewport.height=320;t.viewport.offsetTop=40;t.events.resize();t.flush();
 assert.equal(t.props.get('--inquiry-visible-height'),'320px');
 assert.equal(t.props.get('--inquiry-visible-top'),'40px');assert.equal(t.dialog.scrollTop,314);
 t.viewport.height=740;t.viewport.offsetTop=0;t.events.resize();t.flush();
 assert.equal(t.props.get('--inquiry-visible-height'),'740px');
});
test('closing or switching to desktop clears mobile viewport overrides',()=>{
 const t=setup();t.controller.open();t.dialog.open=false;t.events.close();t.flush();assert.equal(t.props.size,0);
 t.dialog.open=true;t.controller.open();t.media.matches=false;t.events.media();t.flush();assert.equal(t.props.size,0);
});
test('desktop retains its existing focus and scrolling behaviour',()=>{
 const t=setup(false);const field={};t.doc.activeElement=field;t.dialog.scrollTop=100;
 assert.equal(t.controller.open(),false);assert.equal(t.doc.activeElement,field);assert.equal(t.dialog.scrollTop,100);assert.equal(t.props.size,0);
});
