const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const registry=new Map(), context={HTMLElement:class{},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},document:{createElement:()=>({content:{},set innerHTML(value){this.content.html=value;}})},console:{info(){}}};
let source=fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8');
source=source.replace('function resolveLayoutCandidate(rawConfig, config, layout) {','function resolveLayoutCandidate(rawConfig, config, layout) { globalThis.resolves++;');
source=source.replace('function routeDiagramConnections(model, ids, options = {}) {','function routeDiagramConnections(model, ids, options = {}) { globalThis.routes++;');
vm.runInNewContext(source+'\nglobalThis.preflight=preflightLayoutRender; globalThis.key=layoutGeometryKey; globalThis.cached=cachedLayoutCandidate; globalThis.resolves=0; globalThis.routes=0;',context);
const raw={speicher:{typ:'getrennt'},fm:{pumpe:'sensor.fm',temp:'sensor.temp'},wp:{typ:'luft',betrieb:'sensor.wp',ventil:'sensor.valve'}};
const layout={version:2,components:{fm:{x:400,y:29}},ports:Object.fromEntries(['tank.fm-supply','fm.supply','tank.wp-supply','buffer.lower-supply','wp.lower-supply'].map(id=>[id,{mode:'auto'}]))};
const state=value=>({language:'de',states:{'sensor.fm':{state:'on'},'sensor.temp':{state:value},'sensor.wp':{state:'on'},'sensor.valve':{state:'100'}}});
test('preflight reuses geometry on state-only changes but rechecks live labels and paint',()=>{
  const owner={}, first=context.preflight(raw,layout,state('40'),owner);
  assert.equal(first.status,'rendered-candidate',JSON.stringify(first.errors));
  const firstRoutes=context.routes; assert.equal(context.resolves,1); assert.ok(firstRoutes>1);
  const second=context.preflight(raw,layout,state('41'),owner);
  assert.equal(second.status,'rendered-candidate'); assert.equal(context.resolves,1); assert.equal(context.routes,firstRoutes);
  const fresh=context.preflight(raw,layout,state('41'));
  assert.equal(second.html,fresh.html); assert.equal(context.resolves,2);
  const rejected=context.preflight(raw,layout,state('1000000000'),owner);
  assert.equal(rejected.status,'unsupported'); assert.equal(rejected.errors[0].code,'label-overflow'); assert.equal(rejected.html,undefined);
  assert.equal(context.resolves,2);
});
test('layout and configuration changes invalidate the owner cache',()=>{
  const owner={},base=context.resolves;
  assert.equal(context.preflight(raw,layout,state('40'),owner).status,'rendered-candidate');
  const changed={...layout,components:{fm:{x:401,y:29}}};
  context.preflight(raw,changed,state('40'),owner); assert.equal(context.resolves,base+2);
  context.preflight({...raw,farbe:'ignored-change'},changed,state('40'),owner); assert.equal(context.resolves,base+3);
});
test('key rejects ambiguous or non-plain inputs',()=>{
  const sparse=[]; sparse.length=1;
  for (const value of [NaN,Infinity,undefined,()=>{},new Date(),sparse,Object.create({x:400,y:29})]) assert.equal(context.key(value,{},{}),null);
});

test('mutating a cached model or route forces fresh geometry',()=>{
  const c=new (registry.get('warmwasser-schema-card'))(); c.setConfig(raw); const owner={}, start=context.resolves;
  const first=context.cached(owner,raw,c._cfg,layout); assert.equal(first.status,'candidate');
  first.model.components.fm.origin.x+=17;
  const second=context.cached(owner,raw,c._cfg,layout); assert.equal(context.resolves,start+2);
  assert.equal(second.model.components.fm.origin.x,400);
  second.routes['fm-supply'].points[0].x+=17;
  const third=context.cached(owner,raw,c._cfg,layout); assert.equal(context.resolves,start+3);
  assert.notEqual(third.routes['fm-supply'].points[0].x,second.routes['fm-supply'].points[0].x);
});
test('card live updates reuse safe geometry and rerun live label checks',()=>{
  const c=new (registry.get('warmwasser-schema-card'))();
  c._init=()=>{c._box={get innerHTML(){return this.html||'';},set innerHTML(value){this.html=value;},replaceChildren(content){this.html=content.html;}};};
  c._layoutFeatureEnabled=()=>true; c.setConfig({...raw,layout});
  const start=context.resolves; c.hass=state('40');
  assert.equal(c._layoutStatus.status,'rendered-candidate'); assert.equal(context.resolves,start+1);
  const firstRoutes=context.routes; c.hass=state('41');
  assert.equal(context.resolves,start+1); assert.equal(context.routes,firstRoutes);
  c._model.components.fm.origin.x+=13; c.hass=state('42');
  assert.equal(context.resolves,start+2); assert.equal(c._model.components.fm.origin.x,400);
  c.hass=state('1000000000'); assert.equal(c._layoutStatus.errors[0].code,'label-overflow');
  assert.equal(context.resolves,start+2);
  c.setConfig({...raw,titel:'different',layout}); assert.equal(context.resolves,start+3);
});
