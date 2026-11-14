const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const registry = new Map();
const context = { HTMLElement: class {}, customElements: { get: n => registry.get(n), define: (n, c) => registry.set(n, c) }, window: {}, console: { info() {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8') + '\nglobalThis.resolve = resolveLayoutCandidate;', context);
const Card = registry.get('warmwasser-schema-card');
function fixture(extra = {}) {
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, ...extra };
  const card = new Card(); card.setConfig(raw);
  return { raw, card, resolve: layout => context.resolve(raw, card._cfg, layout) };
}

for (const wp of [false, true]) test(`fresh FM${wp ? '/WP' : ''} candidate validates whole routed batch`, () => {
  const { card, resolve } = fixture(wp ? { wp: { betrieb: 'sensor.wp' } } : {});
  const original = JSON.stringify(card._model);
  const { x, y } = card._model.components.fm.origin;
  const result = resolve({ version: 2, components: { fm: { x: x + 30, y: y + 15 } } });
  assert.equal(result.status, 'candidate', JSON.stringify(result.errors));
  assert.equal(result.model.components.fm.origin.x, x + 30);
  assert.equal(JSON.stringify(card._model), original);
  assert.equal(Object.keys(result.routes).length, wp ? 7 : 2);
  assert.ok(Object.values(result.routes).every(r => r.status === 'routed'));
  assert.equal(Object.hasOwn(result.capabilities.components, 'wp'), wp);
});

test('unproven identities and port overrides are rejected', () => {
  const { resolve } = fixture();
  const result = resolve({ version: 2, components: { wp: { x: 1, y: 2 } }, ports: { 'fm.supply': { mode: 'auto' } } });
  assert.equal(result.status, 'invalid');
  assert.deepEqual(Array.from(result.errors, e => e.code), ['unknown-id', 'unknown-id']);
  assert.equal(result.model, undefined);
});

test('duplicate stable IDs fail closed before exposing any candidate', () => {
  const { resolve } = fixture({ fuehler: [{ id: 'same', entity: 'sensor.a' }, { id: 'same', entity: 'sensor.b' }] });
  const result = resolve({ version: 2 });
  assert.equal(result.status, 'invalid'); assert.equal(result.errors[0].code, 'duplicate-id');
  assert.equal(result.model, undefined);
});

test('unsupported equipment and blocked placements never produce a candidate', () => {
  const unsupported = fixture({ solar: { pumpe: 'sensor.solar' } }).resolve({ version: 2 });
  assert.equal(unsupported.status, 'unsupported');
  const blocked = fixture().resolve({ version: 2, components: { fm: { x: 72, y: 14 } } });
  assert.equal(blocked.status, 'unsupported'); assert.equal(blocked.model, undefined);
});

test('supported configurations reject falsy and version 1 layouts', () => {
  const { resolve } = fixture();
  for (const layout of [null, false, '', 0]) {
    const result = resolve(layout);
    assert.equal(result.status, 'invalid'); assert.equal(result.errors[0].code, 'invalid-layout');
  }
  const v1 = resolve({ version: 1 });
  assert.equal(v1.status, 'invalid'); assert.equal(v1.errors[0].code, 'unsupported-version');
});

for (const [name, extra] of [
  ['source inlet', { wp: { betrieb: 'sensor.wp', quelle_ein: 'sensor.source' } }],
  ['heat meter', { wp: { betrieb: 'sensor.wp', wmz: 'sensor.meter' } }],
  ['long WP name', { wp: { betrieb: 'sensor.wp' }, name_wp: 'Long name' }],
]) test(`scope excludes WP with ${name}`, () => {
  const result = fixture(extra).resolve({ version: 2 });
  assert.equal(result.status, 'unsupported'); assert.equal(result.errors[0].code, 'unsupported-configuration');
});

test('candidate resolution leaves raw and normalized configurations unchanged', () => {
  const { raw, card, resolve } = fixture({ wp: { betrieb: 'sensor.wp' } });
  const rawBefore = JSON.stringify(raw), configBefore = JSON.stringify(card._cfg);
  const { x, y } = card._model.components.fm.origin;
  assert.equal(resolve({ version: 2, components: { fm: { x: x + 30, y: y + 15 } } }).status, 'candidate');
  assert.equal(JSON.stringify(raw), rawBefore); assert.equal(JSON.stringify(card._cfg), configBefore);
  resolve({ version: 1 });
  assert.equal(JSON.stringify(raw), rawBefore); assert.equal(JSON.stringify(card._cfg), configBefore);
});
