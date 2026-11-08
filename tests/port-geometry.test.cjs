const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const registry = new Map();
const context = { HTMLElement: class {}, customElements: { get: n => registry.get(n), define: (n, c) => registry.set(n, c) }, window: {}, console: { info() {} } };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../warmwasser-schema-card.js'), 'utf8') + '\nthis.portGeometry = diagramPortGeometry;', context);
const Card = registry.get('warmwasser-schema-card');
function model(typ) {
  const card = new Card();
  card.setConfig({ speicher: { typ }, fm: true, wp: { typ: 'sole', betrieb: 'binary_sensor.wp' }, solar: { pumpe: 'switch.solar' }, kamin: { typ: 'holz', pumpe: 'switch.kamin' }, heizkreise: [{ pumpe: 'switch.pump' }] });
  return card._model;
}

test('canonical connector geometry is resolved for all five tank types', () => {
  for (const typ of ['getrennt', 'trennblech', 'schicht', 'kombi', 'hygiene']) {
    const m = model(typ), tank = typ === 'getrennt' ? 'hot-tank' : 'tank';
    for (const [ref, side] of [[`${tank}.wp-supply`, 'right'], ['wp.upper-supply', 'top'], ['wp.source-in', 'bottom']]) {
      const g = context.portGeometry(m, ref);
      assert.equal(g.side, side, `${typ}: ${ref}`);
      assert.ok(g.stub, `${typ}: ${ref}`);
      assert.ok(Number.isFinite(g.anchor.x) && Number.isFinite(g.anchor.y));
    }
    const buffer = typ === 'getrennt' ? 'buffer-tank' : 'tank';
    for (const [ref, side] of [[`${buffer}.solar-supply`, 'bottom'], [`${buffer}.solar-return`, 'bottom'], [`${buffer}.additional-supply`, 'left'], [`${buffer}.additional-return`, 'left'], ['additional-heat.supply', 'right'], ['additional-heat.return', 'right']]) {
      const geometry = context.portGeometry(m, ref);
      assert.equal(geometry.side, side, `${typ}: ${ref}`);
      assert.ok(geometry.stub, `${typ}: ${ref}`);
    }
    for (const component of Object.values(m.components)) for (const port of Object.values(component.ports)) {
      if (port.stub) assert.ok(context.portGeometry(m, `${component.id}.${port.id}`).side, `${typ}: ${component.id}.${port.id}`);
    }
    if (m.components.fm) {
      assert.equal(context.portGeometry(m, 'fm.return').side, typ === 'getrennt' ? 'left' : 'right');
      assert.equal(context.portGeometry(m, `${tank}.fm-return`).side, typ === 'getrennt' ? 'right' : 'bottom');
    }
  }
});

test('geometry follows live parent movement without asserting boundary sides', () => {
  const m = model('schicht'), parent = m.components.fm;
  const before = context.portGeometry(m, 'domestic-boundary.cold');
  const stubBefore = context.portGeometry(m, 'fm.supply');
  assert.equal(before.side, null);
  assert.equal(before.stub, null);
  parent.origin.x += 23; parent.origin.y -= 11;
  const after = context.portGeometry(m, 'domestic-boundary.cold');
  const stubAfter = context.portGeometry(m, 'fm.supply');
  assert.equal(after.anchor.x, before.anchor.x + 23);
  assert.equal(after.anchor.y, before.anchor.y - 11);
  assert.equal(stubAfter.anchor.x, stubBefore.anchor.x + 23);
  assert.equal(stubAfter.stub[0], stubBefore.stub[0] + 23);
  assert.equal(stubAfter.stub[1], stubBefore.stub[1] - 11);
  assert.equal(stubAfter.side, 'left');
  assert.equal(context.portGeometry(m, 'heat-source.in').side, null);
  assert.throws(() => context.portGeometry(m, 'fm.missing'), /Unknown port/);
});
