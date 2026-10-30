const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cardClass, scenarios, readSource, render } = require('./helpers/legacy-render.cjs');
const Card = cardClass(readSource(path.join(__dirname, '../warmwasser-schema-card.js')));
const cases = scenarios();
function model(name) {
  const scenario = cases.find(x => x.name === name);
  assert.ok(scenario, name);
  const card = new Card(); card.setConfig(scenario.config);
  return card._model;
}
function endpoint(m, ref) {
  if (m.junctions[ref]) return m.junctions[ref];
  const [id, port] = ref.split('.');
  return m.components[id]?.ports[port];
}
function degree(m, id) {
  return Object.values(m.connections).reduce((sum, c) => sum + (c.from === id ? 1 : 0) + (c.to === id ? 1 : 0) + 2 * c.via.filter(x => x === id).length, 0);
}
function edge(m, id, from, to, via = []) {
  const c = m.connections[id]; assert.ok(c, id);
  assert.equal(c.from, from, id); assert.equal(c.to, to, id); assert.deepEqual([...c.via], via, id);
}

test('every modeled connection joins real same-medium ports and junctions with finite geometry', () => {
  for (const scenario of cases) {
    const m = model(scenario.name);
    for (const [id, c] of Object.entries(m.components)) {
      assert.equal(c.id, id, scenario.name);
      for (const v of [c.origin.x, c.origin.y, ...Object.values(c.bounds)]) assert.ok(Number.isFinite(v), `${scenario.name}: ${id}`);
      for (const [p, port] of Object.entries(c.ports)) {
        assert.equal(port.id, p); assert.ok(['heating-water', 'domestic-water', 'solar-loop', 'source-loop', 'district-loop'].includes(port.medium));
        assert.ok(Number.isFinite(port.x) && Number.isFinite(port.y), `${scenario.name}: ${id}.${p}`);
      }
    }
    for (const [id, connection] of Object.entries(m.connections)) {
      assert.equal(connection.id, id);
      const refs = [connection.from, ...connection.via, connection.to];
      const points = refs.map(ref => { const p = endpoint(m, ref); assert.ok(p, `${scenario.name}: ${id} -> ${ref}`); return p; });
      for (const p of points) assert.equal(p.medium, points[0].medium, `${scenario.name}: ${id}`);
    }
    for (const [id, j] of Object.entries(m.junctions)) {
      assert.ok(Number.isFinite(j.x) && Number.isFinite(j.y), `${scenario.name}: ${id}`);
      assert.ok(degree(m, id) >= 2, `${scenario.name}: unconnected junction ${id}`);
    }
  }
});

test('solar, additional heat, domestic water and source paths use their own real ports', () => {
  const m = model('full-system-getrennt');
  edge(m, 'solar-supply', 'solar-collector.supply', 'buffer-tank.solar-supply');
  edge(m, 'solar-coil', 'buffer-tank.solar-supply', 'buffer-tank.solar-return');
  edge(m, 'solar-return-tank', 'buffer-tank.solar-return', 'solar-pump.in');
  edge(m, 'solar-return-collector', 'solar-pump.out', 'solar-collector.return');
  edge(m, 'additional-supply', 'additional-heat.supply', 'buffer-tank.additional-supply');
  edge(m, 'additional-return-tank', 'buffer-tank.additional-return', 'additional-pump.in');
  edge(m, 'additional-return-device', 'additional-pump.out', 'additional-heat.return');
  edge(m, 'domestic-cold', 'domestic-boundary.cold', 'fm.cold-water', ['domestic-cold-tee']);
  edge(m, 'domestic-hot', 'fm.hot-water', 'domestic-boundary.hot', ['domestic-hot-tee']);
  edge(m, 'circulation-hot', 'domestic-hot-tee', 'circulation-pump.in');
  edge(m, 'circulation-cold', 'circulation-pump.out', 'domestic-cold-tee');
  edge(m, 'source-in', 'wp.source-in', 'heat-source.in');
  edge(m, 'source-out', 'heat-source.out', 'wp.source-out');
  edge(m, 'source-ground-loop', 'heat-source.in', 'heat-source.out');
  for (const id of ['domestic-hot-tee', 'domestic-cold-tee']) assert.equal(degree(m, id), 3);
  // FM and WP are equipment, not invented internal water paths.
  for (const c of Object.values(m.connections)) {
    assert.ok(!(c.from.startsWith('fm.') && c.to.startsWith('fm.')));
    assert.ok(!(c.from.startsWith('wp.') && c.to.startsWith('wp.')));
  }
});

test('internal domestic exchanger only exists for combi and hygiene tanks', () => {
  for (const typ of ['trennblech', 'schicht', 'getrennt', 'kombi', 'hygiene']) {
    const m = model(`water/${typ}/both`);
    assert.equal(Boolean(m.connections['domestic-exchanger']), ['kombi', 'hygiene'].includes(typ), typ);
    if (m.connections['domestic-exchanger']) edge(m, 'domestic-exchanger', 'tank.cold-water', 'tank.hot-water');
  }
});

test('each heating branch has a real pump, mixer and rail junction incidence', () => {
  for (let n = 1; n <= 6; n++) {
    const m = model(`circuits/${n}/weiche-true/mix-0`);
    for (let i = 0; i < n; i++) {
      assert.ok(m.components[`heating-circuit-${i}`]);
      assert.ok(m.components[`heating-mixer-${i}`]);
      assert.ok(m.components[`heating-pump-${i}`]);
      assert.equal(degree(m, `manifold-supply-${i}`), 3);
      assert.equal(degree(m, `manifold-return-${i}`), 3);
      const pump = `heating-pump-${i}`;
      assert.ok(Object.values(m.connections).some(c => c.to === `${pump}.in`), pump);
      assert.ok(Object.values(m.connections).some(c => c.from === `${pump}.out`), pump);
    }
  }
});

test('optional loops and symbols follow configuration rather than sensor state', () => {
  for (const typ of ['sole', 'wasser', 'luft']) for (const wp of [false, true]) for (const source of [false, true]) {
    const m = model(`wp-source/${typ}/wp-${wp}/source-${source}`);
    assert.equal(Boolean(m.components['heat-source']), typ !== 'luft');
    assert.equal(Boolean(m.connections['source-in']), typ !== 'luft');
    assert.equal(Boolean(m.connections['source-out']), typ !== 'luft');
    assert.equal(Boolean(m.connections['source-ground-loop']), typ === 'sole');
  }
  for (const mode of ['pump-on', 'pump-off', 'fallback-on', 'fallback-off', 'no-pump-or-power']) {
    const m = model(`solar/${mode}`);
    assert.ok(m.components['solar-collector']); assert.ok(m.connections['solar-coil']);
    assert.equal(Boolean(m.components['solar-pump']), mode.startsWith('pump'));
  }
  const minimal = model('minimal-stub-config');
  for (const id of ['solar-collector', 'additional-heat', 'heat-source', 'circulation-pump', 'fm', 'wp']) assert.ok(!minimal.components[id], id);
});

test('rail primary junctions are endpoints with a separator and internal tees without one', () => {
  for (const hasSeparator of [true, false]) {
    const m = model(`circuits/6/weiche-${hasSeparator}/mix-0`);
    for (const id of ['manifold-primary-supply', 'manifold-primary-return']) assert.equal(degree(m, id), hasSeparator ? 2 : 3, id);
  }
});

function renderedCard(name = 'full-system-getrennt', omitFm = false) {
  const scenario = cases.find(s => s.name === name);
  const card = new Card(); card.setConfig(omitFm ? { ...scenario.config, fm: undefined, zirkulationspumpe: undefined } : scenario.config);
  card._hass = { states: scenario.states, language: scenario.language };
  return card;
}

test('moving component origins moves their symbols and connected SVG routes', () => {
  const examples = {
    'additional-heat': 'M70 340H-38V352',
    'solar-collector': 'M-168 48V387',
    'heat-source': 'H420Q420 564 435 564',
    'heating-circuit-0': 'M206 630V564',
    'wp': 'M277 282.5H346V294.5',
    'buffer-tank': 'M226 352V340',
    'manifolds': 'M342 410H348Q356 410 356 418V502H376',
  };
  for (const [id, route] of Object.entries(examples)) {
    // Isolate WP/tank endpoint movement from unsupported routing in the full FM system.
    const card = renderedCard('full-system-getrennt', id === 'wp' || id === 'buffer-tank'); const before = card._render();
    card._model.components[id].origin.x += 20; card._model.components[id].origin.y += 12;
    const after = card._render();
    assert.ok(!before.includes(route) && after.includes(route), `${id}: connected route did not follow origin`);
    if (id !== 'manifolds') assert.ok(after.includes('<g transform="translate(20 12)">'), `${id}: symbol did not follow origin`);
  }
});

test('changing connection endpoints changes rendered paths for each modeled family', () => {
  const examples = [
    ['additional-supply', 'to', 'buffer-tank.additional-return', 'M-58 227H70V340'],
    ['solar-supply', 'from', 'solar-collector.return', 'M-232 36V387'],
    ['domestic-hot', 'to', 'domestic-boundary.cold', 'M428 12V-26H362'],
    ['source-in', 'to', 'heat-source.out', 'H430H400V540Q400 552 415 552'],
    ['heating-mixed-0', 'to', 'heating-pump-0.out', 'M154 566V594H154V574H154V594H154V594H154V618'],
  ];
  for (const [id, side, ref, route] of examples) {
    const card = renderedCard(); const before = card._render();
    card._model.connections[id][side] = ref;
    const after = card._render();
    assert.ok(!before.includes(route) && after.includes(route), `${id}: ${side} ignored`);
  }
});

test('district heat has its own external primary loop only for Fernwaerme', () => {
  for (const typ of ['kamin', 'holzvergaser', 'pellet', 'gas', 'oel', 'fernwaerme', 'bhkw']) {
    const m = model(`source-combination/${typ}/getrennt/on`);
    assert.equal(Boolean(m.components['district-boundary']), typ === 'fernwaerme');
    if (typ === 'fernwaerme') {
      edge(m, 'district-supply', 'district-boundary.supply', 'additional-heat.district-supply');
      edge(m, 'district-return', 'additional-heat.district-return', 'district-boundary.return');
      assert.equal(endpoint(m, 'district-boundary.supply').medium, 'district-loop');
    } else { assert.ok(!m.connections['district-supply']); assert.ok(!m.connections['district-return']); }
  }
});

test('inline pumps have continuous same-medium paths through their actual ports', () => {
  const m = model('full-system-getrennt');
  for (const [id, component] of [['additional-pump-through', 'additional-pump'], ['solar-pump-through', 'solar-pump'], ['circulation-pump-through', 'circulation-pump'], ['heating-pump-through-0', 'heating-pump-0']]) {
    edge(m, id, `${component}.in`, `${component}.out`);
    for (const p of ['in', 'out']) {
      const ref = `${component}.${p}`;
      const connections = Object.values(m.connections).filter(c => c.from === ref || c.to === ref);
      assert.equal(connections.length, 2, ref);
      assert.equal(endpoint(m, connections[0].from).medium, endpoint(m, connections[1].to).medium, ref);
    }
  }
  for (const p of ['supply', 'mixed', 'bypass']) {
    const ref = `heating-mixer-0.${p}`;
    assert.equal(Object.values(m.connections).filter(c => c.from === ref || c.to === ref).length, 1, ref);
    assert.equal(endpoint(m, ref).medium, 'heating-water');
  }
});

test('rendered meter points are degree-two junctions on their real medium paths', () => {
  const scenario = cases.find(s => s.name === 'full-system-getrennt');
  const cfg = { ...scenario.config, zusatzwaerme: { ...scenario.config.zusatzwaerme, wmz: 'sensor.energy' }, trinkwasser: { zaehler: 'sensor.energy' } };
  const card = new Card(); card.setConfig(cfg); const m = card._model;
  for (const [id, medium] of [['wp-meter-point', 'heating-water'], ['additional-meter-point', 'heating-water'], ['domestic-meter-point', 'domestic-water']]) {
    assert.equal(m.junctions[id].kind, 'meter'); assert.equal(m.junctions[id].medium, medium);
    assert.equal(degree(m, id), 2, id);
    assert.equal(Object.values(m.connections).filter(c => c.via.includes(id)).length, 1, id);
  }
});

test('moving each inline pump reroutes the visible pipe through the moved pump', () => {
  const paths = {
    'additional-pump': 'M70 340H6V352H6V352H-14V352',
    'solar-pump': 'V222H-212V222H-212V202',
    'circulation-pump': 'M428 -6H425V6H425V6H405V6',
    'heating-pump-0': 'M154 566V586H174V586H174V606',
  };
  for (const [id, path] of Object.entries(paths)) {
    const card = renderedCard(); const before = card._render();
    card._model.components[id].origin.x += 20; card._model.components[id].origin.y += 12;
    const after = card._render();
    assert.ok(!before.includes(path) && after.includes(path), `${id}: pipe did not follow pump`);
  }
});
