const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const registry = new Map();
const context = {HTMLElement:class {}, customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)}, window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8') + '\nglobalThis.api={prepareLegacyWpHeatingRails,checkHeatingRailEnvelopes,validateDirectedFixedPolyline};',context);
const {prepareLegacyWpHeatingRails:prepare,checkHeatingRailEnvelopes:check,validateDirectedFixedPolyline:line}=context.api;
const fixture = () => {const c=new (registry.get('warmwasser-schema-card'))();c.setConfig({speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp'},heizkreise:[{vorlauf:'sensor.vl'}]});return c._model;};
const straight = (y,x1=180,x2=250) => line({id:'branch',points:[{x:x1,y},{x:x2,y}],nodes:[{ref:'a',x:x1,y},{ref:'b',x:x2,y}]});

test('checks the full ordinary stroke against rail paint including touching', () => {
  for (const dy of [0,10]) {
    const m=fixture(); m.components.manifolds.origin.y+=dy;
    const p=prepare(m);
    for (const d of [13,14]) assert.equal(check(p,[straight(420+dy+d)]).reason,'rail-line-contact');
    assert.equal(check(p,[straight(420+dy-15)]).status,'clear');
    assert.equal(check(p,[straight(410+dy,110,120)]).reason,'rail-line-contact');
  }
});

test('rejects mutated preparation and untrusted candidates', () => {
  const p=prepare(fixture());
  assert.equal(check(p,[{id:'forged',points:[],nodes:[]}]).code,'invalid-input');
  p.rails[0].areas[0].x++;
  assert.equal(check(p,[straight(390)]).reason,'invalid-rail-batch');
});

test('a rail reference cannot resolve to a different point on an ordinary line', () => {
  const p=prepare(fixture());
  const wrong=line({id:'unrelated',points:[{x:10,y:100},{x:50,y:100}],nodes:[{ref:'manifold-supply-0',x:10,y:100},{ref:'end',x:50,y:100}]});
  assert.equal(wrong.status,'routed');
  assert.equal(check(p,[wrong]).reason,'reference-coordinate-conflict');
});

test('only the correct named incidence permits a local straight contact', () => {
  for (const dy of [0,10]) {
    const m=fixture(); m.components.manifolds.origin.y+=dy;
    const p=prepare(m), n=p.rails[1].nodes.find(n=>n.ref==='manifold-supply-0');
    const branch=(id,ref,side) => line({id,points:[{x:n.x,y:n.y+(side==='top'?-40:40)},{x:n.x,y:n.y}],
      nodes:[{ref:'end',x:n.x,y:n.y+(side==='top'?-40:40)},{ref,x:n.x,y:n.y}]});
    const short=line({id:'heating-supply-0',points:[{x:n.x,y:n.y},{x:n.x,y:n.y+11}],nodes:[{ref:n.ref,x:n.x,y:n.y},{ref:'end',x:n.x,y:n.y+11}]});
    assert.equal(check(p,[short]).status,'clear');
    assert.equal(check(p,[branch('wrong',n.ref,'top')]).reason,'rail-line-contact');
    assert.equal(check(p,[branch('heating-supply-0','wrong','top')]).reason,'rail-line-contact');
    assert.equal(check(p,[branch('heating-supply-0',n.ref,'top')]).reason,'rail-line-contact');
    const extraNode=line({id:'heating-supply-0',points:[{x:n.x,y:n.y},{x:n.x,y:n.y+6},{x:n.x,y:n.y+11}],nodes:[{ref:n.ref,x:n.x,y:n.y},{ref:'extra',x:n.x,y:n.y+6},{ref:'end',x:n.x,y:n.y+11}]});
    assert.equal(check(p,[extraNode]).reason,'rail-line-contact');
    const second=line({id:'heating-supply-0',points:[{x:n.x-30,y:n.y+12},{x:n.x-30,y:n.y+40},{x:n.x,y:n.y+40},{x:n.x,y:n.y}],
      nodes:[{ref:'end',x:n.x-30,y:n.y+12},{ref:n.ref,x:n.x,y:n.y}]});
    assert.equal(second.status,'routed');
    assert.equal(check(p,[second]).reason,'rail-line-contact');
    const cap=p.rails[1].nodes.find(n=>n.ref==='manifold-primary-supply');
    const byCap=line({id:'hk-supply',points:[{x:cap.x,y:cap.y-30},{x:cap.x,y:cap.y}],nodes:[{ref:'end',x:cap.x,y:cap.y-30},{ref:cap.ref,x:cap.x,y:cap.y}]});
    assert.equal(check(p,[byCap]).status,'clear');
    const foreignCap=line({id:'foreign',points:[{x:cap.x,y:cap.y-30},{x:cap.x,y:cap.y}],nodes:[{ref:'end',x:cap.x,y:cap.y-30},{ref:cap.ref,x:cap.x,y:cap.y}]});
    assert.equal(check(p,[foreignCap]).reason,'rail-line-contact');
    const wrongCapRef=line({id:'hk-supply',points:[{x:cap.x,y:cap.y-30},{x:cap.x,y:cap.y}],nodes:[{ref:'end',x:cap.x,y:cap.y-30},{ref:'other',x:cap.x,y:cap.y}]});
    assert.equal(check(p,[wrongCapRef]).reason,'rail-line-contact');
    const extraCapNode=line({id:'hk-supply',points:[{x:cap.x,y:cap.y-30},{x:cap.x,y:cap.y-15},{x:cap.x,y:cap.y}],nodes:[{ref:'end',x:cap.x,y:cap.y-30},{ref:'extra',x:cap.x,y:cap.y-15},{ref:cap.ref,x:cap.x,y:cap.y}]});
    assert.equal(check(p,[extraCapNode]).reason,'rail-line-contact');
    const secondCap=line({id:'hk-supply',points:[{x:cap.x-30,y:cap.y-12},{x:cap.x-30,y:cap.y-40},{x:cap.x,y:cap.y-40},{x:cap.x,y:cap.y}],nodes:[{ref:'end',x:cap.x-30,y:cap.y-12},{ref:cap.ref,x:cap.x,y:cap.y}]});
    assert.equal(check(p,[secondCap]).reason,'rail-line-contact');
  }
});

test('corner envelopes and bridges are not assumed clear', () => {
  const p=prepare(fixture());
  const corner=line({id:'corner',points:[{x:180,y:390},{x:180,y:405},{x:160,y:405}],nodes:[{ref:'a',x:180,y:390},{ref:'b',x:160,y:405}]});
  assert.equal(corner.status,'routed');
  assert.equal(check(p,[corner]).reason,'rail-line-contact');
  const h=line({id:'h',points:[{x:10,y:100},{x:100,y:100}],nodes:[{ref:'h1',x:10,y:100},{ref:'h2',x:100,y:100}]});
  const v=line({id:'v',points:[{x:50,y:50},{x:50,y:150}],nodes:[{ref:'v1',x:50,y:50},{ref:'v2',x:50,y:150}]});
  assert.equal(check(p,[h,v]).reason,'bridge-envelope-unproven');
});

test('return primary cap contact is local and does not exempt the supply rail', () => {
  for (const dy of [0,10]) {
    const m=fixture(); m.components.manifolds.origin.y+=dy;
    const p=prepare(m), n=p.rails[0].nodes.find(n=>n.ref==='manifold-primary-return');
    const branch=lead => line({id:'hk-return',points:[{x:n.x,y:n.y-lead},{x:n.x,y:n.y}],nodes:[{ref:'end',x:n.x,y:n.y-lead},{ref:n.ref,x:n.x,y:n.y}]});
    assert.equal(check(p,[branch(12)]).status,'clear');
    assert.equal(check(p,[branch(15)]).reason,'rail-line-contact');
  }
});

test('overflow in a painted envelope fails closed', () => {
  const options={halfWidth:Number.MAX_VALUE};
  const p=prepare(fixture(),options);
  const x1=-Number.MAX_VALUE, x2=-Number.MAX_VALUE/2;
  const candidate=line({id:'huge',points:[{x:x1,y:100},{x:x2,y:100}],nodes:[{ref:'a',x:x1,y:100},{ref:'b',x:x2,y:100}]},options);
  assert.equal(p.reason,'rail-batch-validation-required');
  assert.equal(candidate.status,'routed');
  assert.equal(check(p,[candidate],options).reason,'invalid-envelope');
});
