const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const registry = new Map();
const context = { HTMLElement: class {}, customElements: { get: (n) => registry.get(n), define: (n, c) => registry.set(n, c) }, window: {}, console: { info() {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8'), context);
const Editor = registry.get('warmwasser-schema-card-editor');

function wpFields(config) {
  const e = new Editor();
  e._config = config;
  e._hass = { language: 'de' };
  const wp = e._mainSchema().find((s) => s.name === 'wp');
  return JSON.parse(JSON.stringify(wp.schema.flatMap((s) => (s.type === 'grid' ? s.schema.map((x) => x.name) : [s.name]))));
}

test('valve settings appear directly after the valve entity and only when one is set', () => {
  const without = wpFields({ wp: { leistung: 'sensor.p' } });
  for (const name of ['ventil_oben', 'ventil_unten', 'ventil_invertieren']) assert.ok(!without.includes(name), name);
  assert.ok(without.includes('ventil'));
  const withValve = wpFields({ wp: { leistung: 'sensor.p', ventil: 'sensor.v' } });
  const i = withValve.indexOf('ventil');
  assert.deepEqual(withValve.slice(i, i + 4), ['ventil', 'ventil_oben', 'ventil_unten', 'ventil_invertieren']);
  assert.equal(withValve[i + 4], 'kuehlen');
});

test('valve fields have German and English labels', () => {
  for (const language of ['de', 'en']) {
    const e = new Editor();
    e._config = { sprache: language };
    e._hass = { language };
    const L = e._L();
    for (const name of ['ventil_oben', 'ventil_unten', 'ventil_invertieren']) assert.ok(L[name] && L[name] !== name, `${language} ${name}`);
  }
});
