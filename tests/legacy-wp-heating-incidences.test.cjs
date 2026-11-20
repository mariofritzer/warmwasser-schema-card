const { test } = require('node:test');
const assert = require('node:assert/strict');
const { card, resolveLegacyWpHeatingIncidences: resolve } = require('./helpers/routing-harness.cjs');
const model = extra => card('schicht', { fm:null, wp:{betrieb:'sensor.wp'}, heizkreise:[{vorlauf:'sensor.vl'}], ...extra })._model;
const plain = v => JSON.parse(JSON.stringify(v));

test('resolves named junctions and outward segment sides from the canonical recipes', () => {
  const m = model(), before = plain(m), result = plain(resolve(m));
  assert.equal(result.status, 'resolved');
  assert.equal(result.junctions.length, 6);
  const tee = result.junctions.find(j => j.ref === 'supply-tee');
  assert.deepEqual(tee.incidences, [
    {connectionId:'wp-lower-supply',segmentIndex:0,side:'right'},
    {connectionId:'wp-lower-supply',segmentIndex:1,side:'left'},
    {connectionId:'hk-supply',segmentIndex:0,side:'bottom'}]);
  const sides = Object.fromEntries(result.junctions.map(j => [j.ref, j.incidences.map(i => `${i.connectionId}:${i.segmentIndex}:${i.side}`)]));
  assert.deepEqual(sides, {
    'supply-tee':['wp-lower-supply:0:right','wp-lower-supply:1:left','hk-supply:0:bottom'],
    'return-tee':['wp-lower-return:0:left','wp-lower-return:1:right','hk-return:0:bottom'],
    'manifold-primary-supply':['manifold-supply:1:left','manifold-supply:2:right','hk-supply:0:top'],
    'manifold-primary-return':['manifold-return:1:left','manifold-return:2:right','hk-return:0:top'],
    'manifold-supply-0':['manifold-supply:0:left','manifold-supply:1:right','heating-supply-0:0:bottom'],
    'manifold-return-0':['manifold-return:0:left','manifold-return:1:right','heating-return-0:0:bottom']
  });
  for (const j of result.junctions) {
    assert.equal(j.medium, 'heating-water');
    assert.deepEqual([j.x,j.y], [m.junctions[j.ref].x,m.junctions[j.ref].y]);
    assert.equal(j.incidences.length, 3);
  }
  assert.deepEqual(plain(m), before);
});

test('tracks permitted vertical parent movement and rejects unproven horizontal movement', () => {
  const m = model(), before = plain(resolve(m));
  m.components.manifolds.origin.y += 10;
  const after = plain(resolve(m));
  assert.equal(after.status, 'resolved');
  for (const id of ['manifold-primary-supply','manifold-primary-return','manifold-supply-0','manifold-return-0'])
    assert.equal(after.junctions.find(j => j.ref === id).y, before.junctions.find(j => j.ref === id).y + 10);
  m.components.manifolds.origin.x += 1;
  assert.equal(resolve(m).status, 'unsupported');
});

test('the opposite rail crossing is a painted bridge, not a junction incidence', () => {
  const c = card('schicht', { fm:null, wp:{betrieb:'sensor.wp'}, heizkreise:[{vorlauf:'sensor.vl'}] });
  for (const delta of [0, 10]) {
    if (delta) c._model.components.manifolds.origin.y += delta;
    const m = c._model, s = m.junctions['manifold-supply-0'], r = m.junctions['manifold-return-0'];
    assert.ok(c._render().includes(`d="M${s.x} ${s.y}V${r.y-11}A11 11 0 0 1 ${s.x} ${r.y+11}V548"`));
    const junctions = plain(resolve(m)).junctions;
    assert.ok(!junctions.some(j => j.x === s.x && j.y === r.y));
    assert.ok(!junctions.find(j => j.ref === 'manifold-return-0').incidences.some(i => i.connectionId === 'heating-supply-0'));
  }
});

test('supply branch incidence requires a nonzero downward lead before the return-rail bridge', () => {
  for (const [delta, expected] of [[-23,'unsupported'],[-17,'unsupported'],[-16,'resolved']]) {
    const c = card('schicht', { fm:null, wp:{betrieb:'sensor.wp'}, heizkreise:[{vorlauf:'sensor.vl'}] });
    const m = c._model, manifold = m.components.manifolds;
    for (const id of ['return-left','return-right']) manifold.ports[id].y += delta;
    for (const id of ['manifold-return-0','manifold-primary-return']) m.junctions[id].y += delta;
    const supply = m.junctions['manifold-supply-0'], ret = m.junctions['manifold-return-0'];
    const svg = c._render();
    // The actual renderer starts this path at the supply junction, then uses
    // V(returnY - 11) before its arc. A reverse or zero leg has no bottom tangent.
    assert.ok(svg.includes(`d="M${supply.x} ${supply.y}V${ret.y-11}A11 11 0 0 1 ${supply.x} ${ret.y+11}`));
    assert.equal(Math.sign(ret.y - 11 - supply.y), Math.sign(delta + 17));
    assert.equal(resolve(m).status, expected);
  }
});

test('rejects a junction shadowing a port used by the actual SVG renderer', () => {
  const c = card('schicht', { fm:null, wp:{betrieb:'sensor.wp'}, heizkreise:[{vorlauf:'sensor.vl'}] });
  const m = c._model, y = m.junctions['supply-tee'].y;
  assert.equal(Object.keys(m.junctions).length, 6);
  assert.equal(resolve(m).status, 'resolved');
  assert.ok(c._render().includes(`d="M326 ${y}H270A8 8 0 0 0 254 ${y}`));
  m.junctions['wp.lower-supply'] = {id:'wp.lower-supply', x:280, y, medium:'heating-water', kind:'tee'};
  assert.ok(c._render().includes(`d="M280 ${y}H270A8 8 0 0 0 254 ${y}`));
  assert.equal(resolve(m).status, 'unsupported');
});

test('rejects unsupported variants, altered topology, media and local axes', () => {
  for (const extra of [
    {fm:{pumpe:'sensor.fm'}}, {weiche:{temp:'sensor.temp'}},
    {heizkreise:[{vorlauf:'sensor.vl', mischer:'sensor.mix'}]},
    {heizkreise:[{vorlauf:'sensor.vl', pumpe:'sensor.pump'}]},
    {heizkreise:[{vorlauf:'sensor.a'},{vorlauf:'sensor.b'}]},
    {heizkreise:[], verteiler:{anschluesse:[{typ:'frei'}]}}
  ]) assert.equal(resolve(model(extra)).status, 'unsupported');
  for (const change of [
    m => delete m.connections['hk-supply'],
    m => { m.connections['hk-supply'].to = 'manifold-primary-return'; },
    m => { m.connections['wp-lower-return'].via = []; },
    m => { m.junctions['return-tee'].medium = 'domestic-water'; },
    m => { m.junctions['supply-tee'].x += 1; },
    m => { m.connections.extra = {id:'extra',from:'supply-tee',to:'wp.lower-supply',via:[]}; },
    m => { m.components['heating-circuit-0'].origin.x += 1; }
  ]) { const m=model(); change(m); assert.equal(resolve(m).status, 'unsupported'); }
});
