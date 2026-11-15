const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {card}=require('./helpers/routing-harness.cjs');
const context={HTMLElement:class {},customElements:{get(){},define(){}},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.inspectDecorations=inventoryLegacyHeatingDecorations;',context);
const model=()=>card('schicht',{fm:null,wp:{betrieb:'sensor.wp'},heizkreise:[{vorlauf:'sensor.vl'}]})._model;
const inspect=m=>context.inspectDecorations(m,{rails:[]},[],{routes:{}},{owner:'heating-supply-0',envelope:{x:0,y:0,width:0,height:0}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('WP shadow filter region follows the painted rectangle and translation',()=>{
  const m=model(), first=inspect(m), wp=first.shadows.find(s=>s.id==='wp');
  assert.equal(first.status,'unsupported');
  [294,83.4,192,355.2].forEach((v,i)=>near([wp.x,wp.y,wp.width,wp.height][i],v));
  m.components.wp.origin.x+=17; m.components.wp.origin.y-=9;
  const moved=inspect(m).shadows.find(s=>s.id==='wp');
  near(moved.x,wp.x+17); near(moved.y,wp.y-9);
  near(moved.width,wp.width); near(moved.height,wp.height);
});
test('nonfinite and degenerate shadow dimensions fail closed',()=>{
  for (const [id,key,value] of [['wp','width',0],['wp','height',-1],['tank','width',Infinity],['tank','height',NaN]]) {
    const m=model(); m.components[id].bounds[key]=value;
    const result=inspect(m);
    assert.equal(result.status,'unsupported');
    assert.equal(result.reason,'invalid-decoration-inventory');
  }
});
