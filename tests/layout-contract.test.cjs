const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { HTMLElement: class {}, customElements: { get() {}, define() {} }, window: {}, console: { info() {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8') +
  '\nglobalThis.helpers = { layoutIdentityMap, validateLayoutV2 };', context);
const { layoutIdentityMap, validateLayoutV2 } = context.helpers;
const plain = value => JSON.parse(JSON.stringify(value));

test('stable IDs follow active list entries across reordering and filtering', () => {
  const a = { id: 'a', entity: 'sensor.a' }, b = { id: 'b', entity: 'sensor.b' };
  const h1 = { id: 'one', pumpe: 'switch.one' }, h2 = { id: 'two', pumpe: 'switch.two' };
  const first = layoutIdentityMap({ fuehler: [a, { id: 'inactive' }, b], heizkreise: [h1, h2] });
  const second = layoutIdentityMap({ fuehler: [b, a], heizkreise: [h2, h1] });
  assert.deepEqual(plain(first.errors), []);
  assert.equal(first.components['sensor:b'], 'sensor-1');
  assert.equal(second.components['sensor:b'], 'sensor-0');
  assert.equal(first.components['heating-circuit:one'], 'heating-circuit-0');
  assert.equal(second.components['heating-circuit:one'], 'heating-circuit-1');
  assert.equal(first.components['sensor:inactive'], undefined);
});

test('missing IDs do not gain identities and invalid or duplicate IDs are reported', () => {
  const cfg = { fuehler: [['legacy', 'sensor.old', 50], { entity: 'sensor.x', id: 'x.y' },
    { entity: 'sensor.a', id: 'same' }, { entity: 'sensor.b', id: 'same' }],
  heizkreise: [{ pumpe: 'switch.x', id: 'same' }] };
  const before = JSON.stringify(cfg), result = layoutIdentityMap(cfg);
  assert.equal(JSON.stringify(cfg), before);
  assert.deepEqual(plain(result.errors).map(e => e.code), ['invalid-id', 'duplicate-id']);
  assert.equal(result.components['sensor:same'], 'sensor-2');
  assert.equal(result.components['heating-circuit:same'], 'heating-circuit-0');
  assert.equal(Object.keys(result.components).length, 2);
});

test('heating circuit mapping follows the six active circuit limit', () => {
  const heizkreise = [{ id: 'inactive' }, ...Array.from({ length: 7 }, (_, i) => ({ id: `h${i}`, pumpe: `switch.h${i}` }))];
  const result = layoutIdentityMap({ heizkreise });
  assert.equal(result.components['heating-circuit:h5'], 'heating-circuit-5');
  assert.equal(result.components['heating-circuit:h6'], undefined);
  assert.equal(result.components['heating-circuit:inactive'], undefined);
});

test('layout validation reports orphaned entries and rejects malformed overrides', () => {
  const caps = { components: { fm: 'fm' }, ports: { 'fm.supply': ['left', 'right'] } };
  assert.deepEqual(plain(validateLayoutV2({ version: 2, components: { fm: { x: 10, y: -3 } },
    ports: { 'fm.supply': { mode: 'manual', side: 'left' } } }, caps).errors), []);
  assert.deepEqual(plain(validateLayoutV2({ version: 2, ports: { 'fm.supply': { mode: 'auto' } } }, caps).errors), []);
  const errors = plain(validateLayoutV2({ version: 1, components: { removed: { x: Infinity, y: 1 } },
    ports: { 'fm.supply': { mode: 'manual', side: 'top' }, missing: { mode: 'auto', side: 'left' } }, extra: true }, caps).errors);
  assert.deepEqual(errors.map(e => e.code), ['unknown-field', 'unsupported-version', 'unknown-id', 'invalid-position', 'invalid-side', 'unknown-id', 'invalid-side']);
  assert.equal(errors[2].path, 'layout.components.removed');
  assert.equal(validateLayoutV2(null, caps).errors[0].code, 'invalid-layout');
});

test('layout validation rejects malformed sections, entries, modes and coordinates', () => {
  const caps = { components: { fm: 'fm' }, ports: { 'fm.supply': ['left'] } };
  for (const value of [null, [], 3, 'text']) {
    assert.equal(validateLayoutV2({ version: 2, components: value }, caps).errors[0].code, 'invalid-section');
    assert.equal(validateLayoutV2({ version: 2, ports: { 'fm.supply': value } }, caps).errors[0].code, 'invalid-entry');
  }
  for (const value of [NaN, Infinity, -Infinity, '1', null, undefined]) {
    assert.equal(validateLayoutV2({ version: 2, components: { fm: { x: value, y: 0 } } }, caps).errors[0].code, 'invalid-position');
  }
  for (const mode of [undefined, '', 'automatic', null]) {
    assert.equal(validateLayoutV2({ version: 2, ports: { 'fm.supply': { mode } } }, caps).errors[0].code, 'invalid-mode');
  }
  assert.equal(validateLayoutV2({ version: 2, ports: { 'fm.supply': { mode: 'manual' } } }, caps).errors[0].code, 'invalid-side');
});
