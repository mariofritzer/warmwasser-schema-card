const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const registry = new Map();
const context = {HTMLElement:class {},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8') + '\nglobalThis.api={prepareLegacyWpHeatingRails,checkLegacyHeatingBridgeBatch,inspectCompleteLegacyWpHeatingBatch,validateDirectedFixedPolyline};',context);
const {prepareLegacyWpHeatingRails:prepare,checkLegacyHeatingBridgeBatch:check,inspectCompleteLegacyWpHeatingBatch:complete,validateDirectedFixedPolyline:line}=context.api;
function fixture() {
  const c=new (registry.get('warmwasser-schema-card'))();
  c.setConfig({speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp'},heizkreise:[{vorlauf:'sensor.vl'}]});
  const m=c._model, s=m.junctions['manifold-supply-0'], r=m.junctions['manifold-return-0'];
  const comp=m.components['heating-circuit-0'], p=comp.ports.supply;
  const end={x:comp.origin.x+p.x,y:comp.origin.y+p.y};
  const owner=line({id:'heating-supply-0',role:'supply',points:[{x:s.x,y:s.y},end],nodes:[{ref:s.id,x:s.x,y:s.y},{ref:'heating-circuit-0.supply',...end}]});
  return {m,prepared:prepare(m),owner,s,r};
}
function other(id, a, b) {
  return line({id,points:[a,b],nodes:[{ref:id+'-a',...a},{ref:id+'-b',...b}]});
}
test('A11 proof is checked against each supplied line and remains an internal geometry result', () => {
  const {prepared,owner,s,r}=fixture();
  assert.equal(check(prepared,[owner]).status,'clear');
  const far=other('far',{x:10,y:100},{x:60,y:100});
  assert.equal(check(prepared,[owner,far]).status,'clear');
  // The ordinary centerlines do not touch, but the painted A11 envelope does.
  const near=other('near',{x:s.x+20,y:r.y+20},{x:s.x+60,y:r.y+20});
  assert.equal(near.status,'routed');
  assert.equal(check(prepared,[owner,near]).reason,'legacy-bridge-line-clearance');
  assert.equal(check(prepared,[far]).reason,'legacy-bridge-owner-required');
  assert.equal(check(prepared,[owner,{...owner}]).reason,'legacy-bridge-owner-required');
});
test('the whole ordinary batch must be trusted and ordinary bridges clear the rails', () => {
  const {prepared,owner}=fixture();
  assert.equal(check(prepared,[owner,{id:'fake',nodes:[],points:[]}]).code,'invalid-input');
  const h=other('h',{x:10,y:100},{x:100,y:100});
  const v=other('v',{x:50,y:50},{x:50,y:150});
  assert.equal(check(prepared,[owner,h,v]).status,'clear');
});
test('an A6 bridge envelope must clear rail paint, cap paint, and the A11 envelope', () => {
  const {prepared,owner}=fixture();
  const railH=other('rail-h',{x:90,y:400},{x:149,y:400});
  const railV=other('rail-v',{x:119,y:370},{x:119,y:430});
  assert.equal(check(prepared,[owner,railH]).status,'clear');
  assert.equal(check(prepared,[owner,railV]).status,'clear');
  assert.equal(check(prepared,[owner,railH,railV]).reason,'rail-line-contact');
  const capH=other('cap-h',{x:280,y:399},{x:345,y:399});
  const capV=other('cap-v',{x:316,y:370},{x:316,y:430});
  assert.equal(check(prepared,[owner,capH]).status,'clear');
  assert.equal(check(prepared,[owner,capV]).status,'clear');
  assert.equal(check(prepared,[owner,capH,capV]).reason,'rail-line-contact');
  const nearH=other('near-h',{x:169.5,y:475},{x:205,y:475});
  const nearV=other('near-v',{x:181,y:463.5},{x:181,y:500});
  assert.equal(check(prepared,[owner,nearH]).status,'clear');
  assert.equal(check(prepared,[owner,nearV]).status,'clear');
  assert.equal(check(prepared,[owner,nearH,nearV]).reason,'legacy-bridge-line-clearance');
});
test('model-bound inventory requires all nine exact model connections and trusted routes', () => {
  const {m,owner}=fixture();
  assert.equal(complete(m,[owner]).reason,'incomplete-heating-batch');
  const ids=['wp-upper-supply','wp-upper-return','wp-valve-return','wp-lower-supply','wp-lower-return','hk-supply','hk-return','heating-supply-0','heating-return-0'];
  const point=ref=>{const j=m.junctions[ref]; if(j) return {x:j.x,y:j.y}; const [id,name]=ref.split('.'),c=m.components[id],p=c.ports[name]; return {x:c.origin.x+p.x,y:c.origin.y+p.y};};
  const routes=ids.map(id=>{const e=m.connections[id]; return {id,nodes:[e.from,...e.via,e.to].map(ref=>({ref,...point(ref)})),points:[]};});
  // Merely matching the model inventory cannot bypass candidate provenance.
  assert.equal(complete(m,routes).code,'invalid-input');
  routes[0].nodes[0].x++;
  assert.equal(complete(m,routes).reason,'route-model-mismatch');
  routes[0].nodes[0].x--;
  m.components.wp.ports['upper-supply'].medium='domestic-water';
  assert.equal(complete(m,routes).reason,'unproven-port-geometry');
  m.components.wp.ports['upper-supply'].medium='heating-water';
  m.components.valve.ports.upper.direction='left';
  assert.equal(complete(m,routes).reason,'unproven-port-geometry');
  m.components.valve.ports.upper.direction='top';
  m.connections['wp-upper-supply'].routingPolicy='fixed';
  assert.equal(complete(m,routes).reason,'unproven-connection-inventory');
  m.connections['wp-upper-supply'].routingPolicy='external';
  m.connections['wp-upper-supply'].to='tank.lower-supply';
  assert.equal(complete(m,routes).reason,'unproven-connection-inventory');
});
