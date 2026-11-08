const { test } = require('node:test');
const assert = require('node:assert/strict');
const { card, resolveHeatingGeometry } = require('./helpers/routing-harness.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const make = (n, weiche) => card('getrennt', {
  wp: { typ:'luft' }, weiche,
  heizkreise: Array.from({ length:n }, () => ({ mischer:'sensor.mixer', pumpe:'sensor.pump' }))
})._model;

test('heating geometry follows configured bodies and painted rail order', () => {
  for (let n = 0; n <= 6; n++) for (const weiche of [false, true]) {
    const model = make(n, weiche), result = resolveHeatingGeometry(model);
    assert.equal(result.bodies.length, n * 2 + (n && weiche ? 1 : 0));
    assert.deepEqual(Array.from(result.rails, r => r.id), n ? ['manifold-return', 'manifold-supply'] : []);
    if (!n) continue;
    for (const rail of result.rails) {
      const start = rail.points[0], end = rail.points.at(-1);
      assert.equal(rail.areas.at(-2).x, start.x - 5.4);
      assert.equal(rail.areas.at(-1).x, end.x - 0.4);
      assert.equal(rail.areas.at(-1).height, 20.8);
      assert.equal(rail.areas[0].y, start.y - 9);
    }
  }
});

test('envelopes resolve current component and rail geometry without changing the model', () => {
  const model = make(2, true), before = resolveHeatingGeometry(model);
  const pump = model.components['heating-pump-0'], manifold = model.components.manifolds;
  const body = before.bodies.find(b => b.owner === pump.id);
  assert.equal(body.x, pump.origin.x - 9.35);
  assert.equal(body.width, 38.7);
  pump.origin.x += 12; pump.origin.y += 7;
  manifold.origin.x += 20; manifold.origin.y += 11;
  const after = resolveHeatingGeometry(model), moved = after.bodies.find(b => b.owner === pump.id);
  assert.equal(moved.x, body.x + 12); assert.equal(moved.y, body.y + 7);
  assert.equal(after.rails[0].points[0].x, before.rails[0].points[0].x + 20);
  assert.equal(after.rails[0].points[0].y, before.rails[0].points[0].y + 11);
  model.junctions['manifold-return-0'].y += 15;
  const snapshot = plain(model), bent = resolveHeatingGeometry(model);
  assert.ok(bent.rails[0].points.some(p => p.y === model.junctions['manifold-return-0'].y));
  assert.ok(bent.rails[0].areas.length > after.rails[0].areas.length);
  assert.deepEqual(plain(model), snapshot);
});

test('bent rail envelope covers the SVG implicit fill as well as its stroke and caps', () => {
  const model = make(1, true);
  model.junctions['manifold-supply-0'].y = 530;
  const rail = resolveHeatingGeometry(model).rails.find(r => r.id === 'manifold-supply');
  const covers = (x, y) => rail.areas.some(a => x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height);
  assert.ok(covers(250, 510), 'implicitly closed fill interior');
  assert.ok(covers(rail.points[0].x - 5.4, rail.points[0].y - 10.4), 'start cap stroke');
  assert.ok(covers(rail.points.at(-1).x + 5.4, rail.points.at(-1).y + 10.4), 'end cap stroke');
  assert.ok(rail.areas.some(a => a.width > 100 && a.height >= 40), 'conservative fill bounding box');
});

test('bent rail envelope covers the shifted highlight implicit fill', () => {
  const model = make(1, true);
  model.junctions['manifold-supply-0'].y = 505;
  model.junctions['manifold-primary-supply'].y = 505;
  const rail = resolveHeatingGeometry(model).rails.find(r => r.id === 'manifold-supply');
  assert.ok(rail.areas.some(a => 165 >= a.x && 165 <= a.x + a.width && 489.5 >= a.y && 489.5 <= a.y + a.height));
});
