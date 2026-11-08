const { test } = require('node:test');
const assert = require('node:assert/strict');
const { card, resolveHeatingEndpointGeometry, heatingCircuitState } = require('./helpers/routing-harness.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const actualState = configs => heatingCircuitState({ heizkreise: configs }, [],
  { hk:'HK', raum:'Raum' }, () => '12', () => 'kWh', () => true, () => 12, 'red', 'blue').hks;

test('legacy arrows are always represented; optional state adds only painted icons', () => {
  for (const weiche of [false, true]) for (let n = 0; n <= 6; n++) {
    const configs = Array.from({ length:n }, (_, i) => ({ pumpe:'sensor.pump', typ:i % 2 ? 'radiator' : 'floor' }));
    const c = card('getrennt', { heizkreise:configs, weiche }), model = c._model;
    const snapshot = plain(model), arrows = resolveHeatingEndpointGeometry(model);
    assert.equal(arrows.length, 2 * n);
    const areas = resolveHeatingEndpointGeometry(model, actualState(configs));
    assert.equal(areas.length, 3 * n);
    for (let i = 0; i < n; i++) {
      const b = model.components[`heating-circuit-${i}`], parts = areas.filter(a => a.owner === b.id);
      assert.deepEqual(plain(parts[0]), { owner:b.id, kind:'supply-arrow', x:b.origin.x+1.2, y:b.origin.y-0.8, width:9.6, height:5.6 });
      assert.deepEqual(plain(parts[1]), { owner:b.id, kind:'return-arrow', x:b.origin.x+33.2, y:b.origin.y-0.8, width:9.6, height:5.6 });
      assert.equal(parts[2].kind, i % 2 ? 'radiator' : 'floor');
    }
    assert.deepEqual(plain(model), snapshot);
  }
});

test('icon aliases and row-dependent paint bounds follow actual state and movement', () => {
  for (const [typ, kind, x, y, width, height] of [
    ['fussboden','floor',-4,36,48,20], ['fussbodenheizung','floor',-4,36,48,20], ['floor','floor',-4,36,48,20],
    ['heizkoerper','radiator',1.25,34.25,41.5,21.5], ['radiator','radiator',1.25,34.25,41.5,21.5],
  ]) for (let rows = 0; rows <= 3; rows++) {
    const config = { pumpe:'sensor.pump', typ, ...(rows > 0 && { vorlauf:'sensor.vl', vorlauf_soll:'sensor.target' }),
      ...(rows > 1 && { raum:'sensor.room' }), ...(rows > 2 && { wmz:'sensor.energy' }) };
    const c = card('schicht', { heizkreise:[config] }), model = c._model, b = model.components['heating-circuit-0'];
    b.origin.x += 17; b.origin.y += 23;
    const state = actualState([config]);
    assert.equal(state[0].zeilen.length, rows);
    const icon = resolveHeatingEndpointGeometry(model, state).find(a => a.kind === kind);
    assert.deepEqual(plain(icon), { owner:b.id, kind, x:b.origin.x+x, y:b.origin.y+y+rows*12, width, height });
    const svg = c._render();
    const drawX = b.baseOrigin.x + 22, iconY = b.baseOrigin.y + 37 + rows * 12;
    assert.ok(svg.includes(kind === 'floor'
      ? `M${drawX-22} ${iconY}h40a3 3`
      : `x="${drawX-20}" y="${iconY-2}" width="40" height="20" rx="3"`));
    assert.ok(svg.includes(`M${drawX-20} ${b.baseOrigin.y}l4 4 4-4M${drawX+12} ${b.baseOrigin.y+4}l4-4 4 4`));
  }
});

test('absent, unknown and incomplete state never invents an icon', () => {
  const model = card('schicht', { heizkreise:[{ pumpe:'sensor.pump' }] })._model;
  for (const states of [undefined, [], [{}], [{ typ:'unknown', zeilen:[] }], [{ typ:'floor' }]]) {
    assert.deepEqual(Array.from(resolveHeatingEndpointGeometry(model, states), a => a.kind), ['supply-arrow','return-arrow']);
  }
  model.components['distributor-slot-0'] = { origin:{ x:0, y:0 } };
  assert.equal(resolveHeatingEndpointGeometry(model).length, 2);
});

test('endpoint envelopes follow a parent-relative origin', () => {
  const model = card('schicht', { heizkreise:[{ pumpe:'sensor.pump' }] })._model;
  const branch = model.components['heating-circuit-0'], original = { ...branch.origin }, parent = { x:0, y:0 };
  Object.defineProperties(branch.origin, {
    x: { enumerable:true, get:() => original.x + parent.x },
    y: { enumerable:true, get:() => original.y + parent.y },
  });
  const state = actualState([{ typ:'floor' }]);
  const before = resolveHeatingEndpointGeometry(model, state);
  parent.x = 15; parent.y = -12;
  const after = resolveHeatingEndpointGeometry(model, state);
  for (let i = 0; i < before.length; i++) {
    assert.equal(after[i].x, before[i].x + 15);
    assert.equal(after[i].y, before[i].y - 12);
  }
});
