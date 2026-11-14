const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const registry = new Map();
const context = {HTMLElement:class {}, customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)}, window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8') + '\nglobalThis.api={prepareLegacyWpHeatingRails,compileDirectedJunctionBatch,routeDirectedJunctionConnection};',context);
const {prepareLegacyWpHeatingRails:prepare,compileDirectedJunctionBatch:compile,routeDirectedJunctionConnection:route}=context.api;
const fixture = () => {const c=new (registry.get('warmwasser-schema-card'))();c.setConfig({speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp'},heizkreise:[{vorlauf:'sensor.vl'}]});return c._model;};
const plain = x => JSON.parse(JSON.stringify(x));

test('prepares named fixed rails at canonical and moved manifold positions', () => {
  for (const dy of [0,10]) {
    const m=fixture();m.components.manifolds.origin.y+=dy;
    const before=plain(m), result=prepare(m);
    assert.equal(result.status,'unsupported');
    assert.equal(result.reason,'rail-batch-validation-required');
    assert.deepEqual(Array.from(result.rails,r=>r.id),['manifold-return','manifold-supply']);
    const supply=result.rails[1];
    assert.deepEqual(Array.from(supply.nodes,n=>n.ref),['manifolds.supply-left','manifold-supply-0','manifold-primary-supply','manifolds.supply-right']);
    assert.equal(supply.nodes[0].y,420+dy);
    assert.equal(supply.candidate,undefined);
    assert.deepEqual(plain(m),before);
  }
});

test('rejects obstacles intersecting painted rail or cap outside ordinary pipe width', () => {
  const m=fixture();
  for (const obstacle of [{x:200,y:428,width:1,height:1},{x:125,y:410,width:1,height:1},{x:304,y:410,width:1,height:1}])
    assert.equal(prepare(m,{obstacles:[obstacle]}).code,'rail-obstacle');
  assert.equal(prepare(m,{obstacles:[{x:200,y:390,width:1,height:1}]}).reason,'rail-batch-validation-required');
  assert.equal(prepare(m,{obstacles:Array(1)}).code,'invalid-input');
  assert.equal(prepare(m,{halfWidth:-1}).code,'invalid-input');
});

test('parallel overlap cannot be passed off as a compiled safe rail batch', () => {
  const result=prepare(fixture()), rail=result.rails[1];
  const branch=route({id:'branch',from:{ref:'a',x:180,y:433,direction:'right'},to:{ref:'b',x:250,y:433,direction:'left'},junctions:[]});
  assert.equal(branch.status,'routed');
  assert.ok(rail.areas.some(a => 180 <= a.x+a.width && 250 >= a.x && 428 <= a.y+a.height && 438 >= a.y));
  assert.equal(result.status,'unsupported');
  assert.equal(compile([rail,branch]).code,'invalid-input');
});

test('unproven heating configurations remain unsupported', () => {
  const m=fixture(); m.components.manifolds.origin.x+=1;
  assert.equal(prepare(m).status,'unsupported');
  const n=fixture(); n.connections['hk-supply'].to='manifold-primary-return';
  assert.equal(prepare(n).status,'unsupported');
});
