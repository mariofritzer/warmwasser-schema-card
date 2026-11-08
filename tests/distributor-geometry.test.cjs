const { test } = require('node:test');
const assert = require('node:assert/strict');
const { card, resolveDistributorGeometry } = require('./helpers/routing-harness.cjs');
const plain = x => JSON.parse(JSON.stringify(x));

test('flexible geometry resolves ordered slots, painted shapes and both directions', () => {
  const types = ['heizkoerper', 'fussboden', 'warmwasser', 'frei', 'kein'];
  const slots = Array.from({ length:15 }, (_, i) => ({ typ:types[i % 5] === 'kein' ? 'frei' : types[i % 5],
    symboltyp:types[i % 5], richtung:i % 2 ? 'oben' : 'unten',
    ...(i === 12 ? { status:'blind', pumpe:'sensor.pump' } : { pumpe:'sensor.pump' }),
    ...(i === 13 ? { icon:'mdi:radiator' } : {}) }));
  const c = card('getrennt', { verteiler:{ anschluesse:slots } }), model = c._model;
  const normalized = c._cfg.verteiler.anschluesse;
  const snapshot = plain(model), areas = resolveDistributorGeometry(model, normalized);
  assert.throws(() => resolveDistributorGeometry(model), /complete normalized slot list/);
  for (let i = 0; i < slots.length; i++) {
    const b = model.components[`distributor-slot-${i}`], x = b.origin.x + 48, y = b.origin.y + b.endOffset;
    const own = areas.filter(a => a.owner === b.id);
    if (i === 12) {
      assert.deepEqual(Array.from(own, a => a.kind), ['supply-cap', 'return-cap']);
      assert.deepEqual(plain(own[0]), { owner:b.id, kind:'supply-cap', x:x-24.4, y:y-4.4, width:16.8, height:8.8 });
      assert.ok(!areas.some(a => a.owner === `distributor-pump-${i}`));
    } else {
      assert.deepEqual(Array.from(own.slice(0, 2), a => a.kind), ['supply-arrow','return-arrow']);
      assert.equal(own[0].y, y + (b.up ? 4.2 : -9.8));
      assert.ok(areas.some(a => a.owner === `distributor-pump-${i}` && a.kind === 'pump'));
      assert.equal(own.length, i === 13 || types[i % 5] === 'kein' ? 2 : 3);
    }
  }
  assert.deepEqual(plain(model), snapshot);
});

test('missing, sparse or model-inconsistent slots fail instead of returning partial geometry', () => {
  const c = card('schicht', { verteiler:{ anschluesse:[{ typ:'frei', pumpe:'sensor.pump' }, { typ:'frei', status:'blind', richtung:'oben' }] } });
  const model = c._model, slots = c._cfg.verteiler.anschluesse;
  const sparse = slots.slice(); delete sparse[0];
  const cases = [null, [], slots.slice(0, 1), [...slots, slots[0]], sparse,
    [{ ...slots[0], status:'blind' }, slots[1]],
    [slots[0], { ...slots[1], richtung:'unten' }],
    [{ ...slots[0], pumpe:undefined }, slots[1]],
    [{ ...slots[0], symboltyp:undefined }, slots[1]]];
  for (const input of cases) assert.throws(() => resolveDistributorGeometry(model, input), /complete normalized slot list/);
  assert.ok(resolveDistributorGeometry(model, slots).length);
});

test('symbol and icon snapshots reject swapped or changed slot metadata, including blind slots', () => {
  const input = [{ typ:'frei', symboltyp:'fussboden' }, { typ:'frei', symboltyp:'heizkoerper', icon:'mdi:radiator' },
    { typ:'frei', status:'blind', symboltyp:'warmwasser', icon:'mdi:water' }];
  const c = card('schicht', { verteiler:{ anschluesse:input } }), slots = c._cfg.verteiler.anschluesse, model = c._model;
  const svg = c._render(), before = plain(resolveDistributorGeometry(model, slots));
  assert.ok(Object.isFrozen(model.components['distributor-slot-0'].distributorGeometry));
  for (const changed of [[slots[1], slots[0], slots[2]],
    [{ ...slots[0], symboltyp:'frei' }, slots[1], slots[2]],
    [slots[0], { ...slots[1], icon:'mdi:water' }, slots[2]],
    [slots[0], slots[1], { ...slots[2], icon:undefined }],
    [slots[0], slots[1], { ...slots[2], symboltyp:'frei' }]])
    assert.throws(() => resolveDistributorGeometry(model, changed), /complete normalized slot list/);
  // Non-geometric metadata does not change the resolved areas.
  const renamed = slots.map(slot => ({ ...slot, name:'Other name', vorlauf:'sensor.other' }));
  assert.deepEqual(plain(resolveDistributorGeometry(model, renamed)), before);
  assert.equal(c._render(), svg);
  const legacy = card('schicht', { heizkreise:[{ pumpe:'sensor.pump' }] });
  assert.equal(legacy._model.components['heating-circuit-0'].distributorGeometry, undefined);
});

test('envelopes follow model and parent positions, including pump movement', () => {
  const c = card('schicht', { verteiler:{ anschluesse:[{ typ:'fussboden', richtung:'oben', pumpe:'sensor.pump' }] } });
  const model = c._model, slots = c._cfg.verteiler.anschluesse;
  const before = resolveDistributorGeometry(model, slots);
  model.components.manifolds.origin.x += 17; model.components.manifolds.origin.y -= 12;
  const after = resolveDistributorGeometry(model, slots);
  for (let i = 0; i < before.length; i++) {
    assert.equal(after[i].x, before[i].x + 17);
    assert.equal(after[i].y, before[i].y - 12);
  }
  model.components['distributor-pump-0'].origin.x += 5;
  const moved = resolveDistributorGeometry(model, slots);
  assert.equal(moved.find(a => a.kind === 'pump').x, after.find(a => a.kind === 'pump').x + 5);
});

test('symbol envelopes correspond to the SVG recipes for each direction', () => {
  const kinds = { heizkoerper:'radiator', fussboden:'floor', warmwasser:'hot-water', frei:'free' };
  for (const direction of ['oben', 'unten']) for (const [type, kind] of Object.entries(kinds)) {
    const c = card('schicht', { verteiler:{ anschluesse:[{ typ:type, richtung:direction }] } });
    const b = c._model.components['distributor-slot-0'], x = b.origin.x + 48;
    const y = b.origin.y + b.endOffset, sy = direction === 'oben' ? y - 34 : y + 65;
    const svg = c._render(), area = resolveDistributorGeometry(c._model, c._cfg.verteiler.anschluesse).find(a => a.kind === kind);
    const expected = {
      radiator:`x="${x-20}" y="${sy}" width="40" height="20"`,
      floor:`M${x-22} ${sy}h40a3 3`,
      'hot-water':`M${x} ${sy}C${x-5} ${sy+8}`,
      free:`cx="${x}" cy="${sy+10}" r="9"`,
    };
    assert.ok(svg.includes(expected[kind]), `${type} SVG`);
    assert.ok(area.x <= x && area.y <= sy && area.y + area.height >= sy + (type === 'warmwasser' ? 25 : 18));
    if (type === 'warmwasser') assert.equal(area.y, sy - 4); // pointed miter extends above the path
  }
});
