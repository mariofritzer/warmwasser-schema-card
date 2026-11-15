const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const registry=new Map();
const context={HTMLElement:class {},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.api={resolveLayoutCandidate,inspectMeasuredVolumeSlots};',context);
const {resolveLayoutCandidate:resolve,inspectMeasuredVolumeSlots:inspect}=context.api;
const record=(text,y,box,dx=0,dy=0)=>({text,x:'137',y:String(y),className:'wc wt wo',matrix:{a:1,b:0,c:0,d:1,e:dx,f:dy},box});
function fixture(speicher,layout) {
  const raw={speicher,fm:{pumpe:'sensor.fm'},wp:{betrieb:'sensor.wp'}},c=new (registry.get('warmwasser-schema-card'))();
  c.setConfig(raw);c._hass={language:'en',states:{}};
  const candidate=resolve(raw,c._cfg,layout);
  assert.equal(candidate.status,'candidate',JSON.stringify(candidate.errors));
  return {c,candidate};
}
test('staged measured volume fits only as unsupported partial evidence',()=>{
  const {c,candidate}=fixture({typ:'schicht',volumen:500},{version:2,components:{fm:{x:360,y:15}}});
  const good=record('500 l',338,{x:125,y:329,width:24,height:10});
  const result=inspect(c,candidate,[good]);
  assert.equal(result.status,'unsupported');assert.equal(result.reason,'volume-slots-staged-only');
  const over=record('500 l',338,{x:90,y:329,width:100,height:10});
  assert.equal(inspect(c,candidate,[over]).reason,'volume-label-overflow');
  assert.equal(inspect(c,candidate,[]).reason,'volume-text-unproven');
  assert.equal(inspect(c,candidate,[good,good]).reason,'volume-text-unproven');
  assert.equal(inspect(c,candidate,[{...good,matrix:{...good.matrix,e:10}}]).reason,'volume-text-unproven');
  const route=Object.keys(candidate.routes)[0];
  candidate.routes[route]={...candidate.routes[route],points:[{x:110,y:334},{x:170,y:334}],crossings:[]};
  assert.equal(inspect(c,candidate,[good]).reason,'volume-label-pipe-contact');
});
test('split tank values use separate model-bound slots and transforms',()=>{
  const {c,candidate}=fixture({typ:'getrennt',volumen:500,volumen_ww:300},{version:2,components:{fm:{x:400,y:29},buffer:{x:77,y:203}}});
  const hot=record('HOT WATER · 300 l',38,{x:110,y:29,width:54,height:10});
  const buffer=record('BUFFER · 500 l',338,{x:115,y:329,width:54,height:10},5,0);
  assert.equal(inspect(c,candidate,[hot,buffer]).reason,'volume-slots-staged-only');
  assert.equal(inspect(c,candidate,[hot]).reason,'volume-text-unproven');
  assert.equal(inspect(c,candidate,[hot,{...buffer,matrix:{...buffer.matrix,e:0}}]).reason,'volume-text-unproven');
  assert.equal(inspect(c,candidate,[hot,{...buffer,box:{...buffer.box,width:100}}]).reason,'volume-label-overflow');
});
