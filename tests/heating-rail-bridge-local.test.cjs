const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const registry = new Map();
const context = {HTMLElement:class {},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../warmwasser-schema-card.js'),'utf8')+'\nglobalThis.api={prepareLegacyWpHeatingRails,inspectLegacyHeatingRailBridge,validateDirectedFixedPolyline};',context);
const {prepareLegacyWpHeatingRails:prepare,inspectLegacyHeatingRailBridge:inspect,validateDirectedFixedPolyline:line}=context.api;
function fixture(options = {}) {
  const c=new (registry.get('warmwasser-schema-card'))();
  c.setConfig({speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp'},heizkreise:[{vorlauf:'sensor.vl'}]});
  c._hass={language:'de',states:{}};
  const m=c._model, s=m.junctions['manifold-supply-0'], r=m.junctions['manifold-return-0'];
  const comp=m.components['heating-circuit-0'], port=comp.ports.supply;
  const end={x:comp.origin.x+port.x,y:comp.origin.y+port.y};
  const candidate=line({id:'heating-supply-0',role:'supply',points:[{x:s.x,y:s.y},end],nodes:[{ref:s.id,x:s.x,y:s.y},{ref:'heating-circuit-0.supply',...end}]},options);
  return {c,s,r,candidate,prepared:prepare(m,options)};
}
test('local evidence matches rendered A11 and remains explicitly incomplete', () => {
  const {c,s,r,candidate,prepared}=fixture();
  const proof=inspect(prepared,candidate);
  assert.equal(proof.status,'unsupported');
  assert.equal(proof.reason,'complete-heating-batch-required');
  assert.equal(proof.localBridge.radius,11);
  assert.equal(proof.localBridge.point.x,s.x);
  assert.equal(proof.localBridge.point.y,r.y);
  assert.equal(proof.localBridge.requiredPaintOrder.join(','),'manifold-return,heating-supply-0');
  const svg=c._render();
  const bridge=svg.indexOf(`d="M${s.x} ${s.y}V${r.y-11}A11 11 0 0 1 ${s.x} ${r.y+11}`);
  const ret=prepared.rails[0].nodes;
  const rail=svg.indexOf(`d="M${ret[0].x} ${ret[0].y}H${ret.at(-1).x}"`);
  assert.ok(rail>=0 && bridge>rail);
});
test('active return rail and its animation paint before every A11 bridge layer', () => {
  const c=new (registry.get('warmwasser-schema-card'))();
  c.setConfig({speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp'},heizkreise:[{vorlauf:'sensor.vl',pumpe:'switch.hk'}]});
  c._hass={language:'de',states:{'switch.hk':{state:'on',attributes:{}}}};
  const m=c._model, s=m.junctions['manifold-supply-0'], r=m.junctions['manifold-return-0'];
  const svg=c._render(), start=svg.indexOf(`d="M${s.x} ${s.y}V${r.y-11}A11 11 0 0 1 ${s.x} ${r.y+11}`);
  const bridgeLayers=[...svg.matchAll(/<path d="([^"]+)" class="(w[0-3])"[^>]*\/>/g)]
    .filter(x=>x[1].startsWith(`M${s.x} ${s.y}V${r.y-11}A11 11 0 0 1 ${s.x} ${r.y+11}`));
  assert.deepEqual(bridgeLayers.map(x=>x[2]),['w0','w1','w2','w3']);
  const ret=m.connections['manifold-return'], comp=m.components.manifolds;
  const pt=ref=>{const p=comp.ports[ref.split('.')[1]];return {x:comp.origin.x+p.x,y:comp.origin.y+p.y};};
  const a=pt(ret.from), b=pt(ret.to), primary=m.junctions['manifold-primary-return'];
  const rail=`d="M${a.x} ${a.y}H${b.x}"`;
  const railLayers=[...svg.matchAll(/<path d="([^"]+)"[^>]*\/>/g)].filter(x=>x[1]===`M${a.x} ${a.y}H${b.x}`);
  assert.equal(railLayers.length,2);
  const highlight=svg.indexOf(`d="M${a.x} ${a.y-3}H${b.x}"`);
  const animation=svg.indexOf(`d="M${r.x} ${r.y}H${primary.x}" class="w3"`);
  const endCap=svg.indexOf(`<rect x="${b.x}" y="${b.y-10}"`);
  assert.ok(svg.indexOf(rail)>=0 && railLayers.every(x=>x.index<start));
  assert.ok(highlight>=0 && highlight<start && endCap>=0 && endCap<start && animation>=0 && animation<start);
});
test('local evidence rejects untrusted or differently prioritised lines and changed rails', () => {
  const {candidate,prepared}=fixture();
  const neutral=line({id:'heating-supply-0',points:candidate.points,nodes:candidate.nodes});
  assert.equal(inspect(prepared,neutral).reason,'legacy-bridge-geometry');
  assert.equal(inspect(prepared,{...candidate}).code,'invalid-input');
  prepared.rails[0].areas[0].x++;
  assert.equal(inspect(prepared,candidate).reason,'invalid-rail-batch');
});
test('local evidence binds the verified endpoint and checks all shared rail references', () => {
  const {candidate,prepared}=fixture();
  const make = (ref, end) => line({id:'heating-supply-0',role:'supply',
    points:[candidate.points[0],end],nodes:[candidate.nodes[0],{ref,...end}]});
  const end=candidate.points[1];
  assert.equal(inspect(prepared,make('foreign',end)).reason,'legacy-bridge-geometry');
  assert.equal(inspect(prepared,make('heating-circuit-0.supply',{x:end.x,y:end.y+1})).reason,'legacy-bridge-geometry');
  assert.equal(inspect(prepared,make('manifold-return-0',end)).reason,'reference-coordinate-conflict');
});
test('the bridge envelope checks obstacles away from its straight centerline', () => {
  const {s,r}=fixture();
  const options={obstacles:[{x:s.x+14,y:r.y-15,width:0,height:0}]};
  const {prepared,candidate}=fixture(options);
  assert.equal(candidate.status,'routed');
  assert.equal(inspect(prepared,candidate,options).reason,'legacy-bridge-clearance');
});
test('a close return rail makes the A11 envelope touch the supply rail', () => {
  const {c,candidate}=fixture(), m=c._model;
  for (const id of ['manifold-return-0','manifold-primary-return']) m.junctions[id].y-=16;
  for (const name of ['return-left','return-right']) m.components.manifolds.ports[name].y-=16;
  const prepared=prepare(m);
  assert.equal(prepared.reason,'rail-batch-validation-required');
  assert.equal(inspect(prepared,candidate).reason,'legacy-bridge-clearance');
});
