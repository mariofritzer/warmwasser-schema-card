const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDirectedFixedPolyline: fixed, routeDirectedJunctionConnection: route, compileDirectedJunctionBatch: compile } = require('./helpers/routing-harness.cjs');
const rail = () => ({id:'rail', role:'supply', points:[{x:130,y:420},{x:154,y:420},{x:295,y:420},{x:300,y:420}], nodes:[{ref:'left',x:130,y:420},{ref:'hk',x:154,y:420},{ref:'primary',x:295,y:420},{ref:'right',x:300,y:420}]});

test('a fixed rail with real node spacing can join a routed branch', () => {
  const r=fixed(rail()); assert.equal(r.status,'routed'); assert.ok(Object.isFrozen(r.points[0]));
  const b=route({id:'branch',from:{ref:'external',x:154,y:340,direction:'bottom'},to:{ref:'hk',x:154,y:420,direction:'top'},junctions:[]});
  assert.equal(b.status,'routed'); assert.equal(compile([r,b]).status,'routed');
  const other=route({id:'branch',from:{ref:'external',x:154,y:340,direction:'bottom'},to:{ref:'other',x:154,y:420,direction:'top'},junctions:[]});
  assert.equal(compile([r,other]).code,'unnamed-contact');
});

test('fixed strokes reject obstacles, close self-approaches and invalid nodes', () => {
  assert.equal(fixed(rail(),{obstacles:[{x:200,y:424,width:3,height:1}]}).code,'pipe-obstacle');
  const self={id:'s',points:[{x:0,y:0},{x:100,y:0},{x:100,y:4},{x:0,y:4}],nodes:[{ref:'a',x:0,y:0},{ref:'b',x:0,y:4}]};
  assert.equal(fixed(self).code,'pipe-clearance');
  const bad=rail(); bad.nodes[1].x=155; assert.equal(fixed(bad).code,'invalid-input');
  assert.equal(fixed(rail(),{obstacles:Array(1)}).code,'invalid-input');
  assert.equal(compile([fixed(rail())],{halfWidth:8}).code,'invalid-input');
});

test('unnamed straight vertices normalize without removing semantic nodes', () => {
  const path = points => ({id:'bend',points,nodes:[{ref:'a',x:0,y:0},{ref:'b',x:20,y:50}]});
  const redundant = fixed(path([{x:0,y:0},{x:16,y:0},{x:20,y:0},{x:20,y:50}]));
  const simple = fixed(path([{x:0,y:0},{x:20,y:0},{x:20,y:50}]));
  assert.equal(redundant.status,'routed'); assert.equal(simple.status,'routed');
  assert.equal(JSON.stringify(redundant.points),JSON.stringify(simple.points));
  const named = fixed({id:'line',points:[{x:0,y:0},{x:50,y:0},{x:100,y:0}],nodes:[{ref:'a',x:0,y:0},{ref:'j',x:50,y:0},{ref:'b',x:100,y:0}]});
  assert.equal(named.points.length,3);
  const line = fixed({id:'line',points:[{x:0,y:0},{x:50,y:0},{x:100,y:0}],nodes:[{ref:'a',x:0,y:0},{ref:'b',x:100,y:0}]});
  const cross = route({id:'cross',from:{ref:'c',x:50,y:-50,direction:'bottom'},to:{ref:'d',x:50,y:50,direction:'top'},junctions:[]});
  assert.equal(line.points.length,2); assert.equal(compile([line,cross]).status,'routed');
});
