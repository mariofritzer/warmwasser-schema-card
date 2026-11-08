const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeDirectedJunctionConnection: route, compileDirectedJunctionBatch: compile } = require('./helpers/routing-harness.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const request = () => ({ id:'trunk', from:{ref:'a', x:0, y:0, direction:'right'}, to:{ref:'b', x:180, y:0, direction:'left'}, junctions:[{ref:'j1', x:60, y:0, incomingSide:'left', outgoingSide:'right'}, {ref:'j2', x:120, y:0, incomingSide:'left', outgoingSide:'right'}] });

test('two ordered junctions retain identities and outward directions deterministically', () => {
  const req = request(), result = route(req);
  assert.equal(result.status, 'routed');
  assert.deepEqual(plain(route(req)), plain(result));
  for (const j of req.junctions) {
    const i = result.points.findIndex(p => p.x === j.x && p.y === j.y);
    assert.ok(i > 0 && i < result.points.length - 1);
    assert.ok(result.points[i-1].x < j.x && result.points[i+1].x > j.x);
    assert.equal(result.nodes.find(n => n.ref === j.ref).x, j.x);
  }
  assert.equal(compile([result]).status, 'routed');
});

test('batch compiler distinguishes a shared junction from coincident unrelated nodes', () => {
  const trunk = route(request());
  const branch = route({ id:'branch', from:{ref:'c', x:60, y:-80, direction:'bottom'}, to:{ref:'j1', x:60, y:0, direction:'top'}, junctions:[] });
  assert.equal(branch.status, 'routed');
  assert.equal(compile([trunk, branch]).status, 'routed');
  const unrelated = route({ id:'branch', from:{ref:'c', x:60, y:-80, direction:'bottom'}, to:{ref:'other', x:60, y:0, direction:'top'}, junctions:[] });
  assert.equal(compile([trunk, unrelated]).code, 'unnamed-contact');
});

test('invalid directions, blocked escapes and self-contact fail explicitly', () => {
  const req = request();
  req.junctions[0].incomingSide = 'diagonal';
  assert.equal(route(req).code, 'invalid-input');
  req.junctions[0].incomingSide = 'left'; req.junctions[0].outgoingSide = 'left';
  assert.equal(route(req).code, 'invalid-input');
  req.junctions[0].outgoingSide = 'right'; req.junctions[1].ref = 'j1';
  assert.equal(route(req).code, 'invalid-input');
  req.junctions[1].ref = 'j2'; req.obstacles = [{x:57,y:-3,width:6,height:6}];
  assert.equal(route(req).code, 'blocked-port');
  const overlap = { id:'loop', from:{ref:'a',x:0,y:0,direction:'right'}, to:{ref:'b',x:0,y:0,direction:'right'}, junctions:[{ref:'j',x:80,y:0,incomingSide:'left',outgoingSide:'top'}] };
  assert.notEqual(route(overlap).status, 'routed');
});

test('rejects inconsistent identities, unsafe clearance and malformed input', () => {
  const req = request();
  req.clearance = 0; req.obstacles = [{x:35,y:3,width:5,height:2}];
  assert.equal(route(req).code, 'invalid-input');
  req.clearance = 6; req.obstacles = []; req.compileOptions = null;
  assert.equal(route(req).code, 'invalid-input');
  delete req.compileOptions; req.junctions = Array(1);
  assert.equal(route(req).code, 'invalid-input');
  const a = route(request());
  const b = route({id:'branch', from:{ref:'c',x:240,y:-50,direction:'bottom'}, to:{ref:'j1',x:240,y:0,direction:'top'}, junctions:[]});
  assert.equal(compile([a,b]).code, 'invalid-input');
  const badId = request(); badId.id = '__proto__';
  assert.equal(route(badId).code, 'invalid-input');
});

test('rejects unrepresentable escapes and overlapping pipe envelopes', () => {
  const small = {id:'small',from:{ref:'a',x:50,y:100,direction:'right'},to:{ref:'b',x:100,y:150,direction:'top'},junctions:[{ref:'j',x:100,y:100,incomingSide:'left',outgoingSide:'right'}],lead:Number.MIN_VALUE};
  assert.notEqual(route(small).status, 'routed');
  const overlap = {id:'overlap',from:{ref:'a',x:0,y:0,direction:'right'},to:{ref:'b',x:0,y:4,direction:'right'},junctions:[{ref:'j1',x:100,y:0,incomingSide:'left',outgoingSide:'bottom'},{ref:'j2',x:100,y:4,incomingSide:'top',outgoingSide:'left'}],lead:1};
  assert.notEqual(route(overlap).status, 'routed');
});

test('batch requires unchanged candidates with matching search policy', () => {
  const a = route(request());
  assert.equal(compile([a], {obstacles:[{x:40,y:-2,width:5,height:5}]}).code, 'invalid-input');
  assert.equal(compile([a], {halfWidth:8}).code, 'invalid-input');
  assert.throws(() => a.nodes.push({ref:'fake',x:30,y:0}), {name:'TypeError'});
  assert.equal(compile([a]).status, 'routed');
  assert.equal(compile([{id:'fake',points:[{x:0,y:0},{x:10,y:0}],nodes:[{ref:'fake',x:5,y:0}]}]).code, 'invalid-input');
});

test('degenerate escapes fail and ordinary short elbow remains routable', () => {
  const same = {id:'one',from:{ref:'a',x:100,y:100,direction:'right'},to:{ref:'b',x:100,y:100,direction:'left'},junctions:[],lead:Number.MIN_VALUE};
  assert.notEqual(route(same).status, 'routed');
  const turn = {id:'turn',from:{ref:'a',x:0,y:0,direction:'right'},to:{ref:'b',x:20,y:50,direction:'top'},junctions:[]};
  assert.equal(route(turn).status, 'routed');
});

test('batch rejects overlapping bridge envelopes', () => {
  const path = (id, x1, y1, d1, x2, y2, d2, role) => route({id, role, from:{ref:id+'-a',x:x1,y:y1,direction:d1}, to:{ref:id+'-b',x:x2,y:y2,direction:d2}, junctions:[]});
  const upper = path('upper',80,0,'left',-80,0,'right','supply');
  const lower = path('lower',-80,17,'right',80,17,'left','supply');
  const under = path('under',0,-60,'bottom',0,80,'top','neutral');
  assert.equal(compile([upper,lower,under]).code, 'bridge-clearance');
});

test('frozen candidates cannot spoof provenance with toJSON or mutate geometry', () => {
  const obstacles = [{x:40,y:35,width:6,height:10}];
  const r = route({id:'safe',from:{ref:'a',x:0,y:0,direction:'right'},to:{ref:'b',x:120,y:0,direction:'left'},junctions:[],obstacles});
  assert.equal(r.status, 'routed');
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.points) && Object.isFrozen(r.points[0]) && Object.isFrozen(r.nodes) && Object.isFrozen(r.nodes[0]));
  const snapshot = JSON.parse(JSON.stringify(r));
  r.toJSON = () => snapshot;
  r.points = [{x:0,y:0},{x:0,y:40},{x:120,y:40},{x:120,y:0}];
  assert.equal(r.toJSON, undefined);
  assert.equal(r.points.length, 2);
  assert.equal(compile([r], {obstacles}).status, 'routed');
  assert.equal(route({...request(),role:1n}).code, 'invalid-input');
  const owner = {}; owner.self = owner;
  assert.equal(route({...request(),obstacles:[{x:0,y:50,width:1,height:1,owner}]}).code, 'invalid-input');
});

test('default lead can reject the existing WP to heating tee spacing', () => {
  // The canonical gap is 31 units, shorter than two default 16-unit escapes.
  // This internal geometry test does not enable or claim WP/HK routing support.
  const q = {id:'wp-tee',from:{ref:'wp',x:326,y:227,direction:'left'},to:{ref:'tee',x:295,y:227,direction:'right'},junctions:[]};
  assert.notEqual(route(q).status, 'routed');
  assert.equal(route({...q, lead:15}).status, 'routed');
});
