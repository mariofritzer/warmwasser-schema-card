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

test('the valve position is offered before the valve entity, the returns only with the valve in the supply', () => {
  const standard = wpFields({ wp: { leistung: 'sensor.p' } });
  assert.ok(standard.indexOf('ventil_position') > -1 && standard.indexOf('ventil_position') < standard.indexOf('ventil'));
  assert.ok(!standard.includes('ruecklauf_anbindung'));
  const supply = wpFields({ wp: { leistung: 'sensor.p', ventil_position: 'vorlauf' } });
  assert.ok(supply.indexOf('ventil_position') < supply.indexOf('ruecklauf_anbindung') && supply.indexOf('ruecklauf_anbindung') < supply.indexOf('ventil'));
});

test('the editor updates its valve fields when the valve position changes', () => {
  const e = new Editor();
  e._config = { wp: { leistung: 'sensor.p' } };
  e._hass = { language: 'de' };
  e._ventilSichtbar = `${e._hatVentil()}|false`;
  let schemas = 0;
  e._mainForm = { set schema(value) { schemas++; } };
  e._ventilFelder();
  assert.equal(schemas, 0);
  e._config = { wp: { leistung: 'sensor.p', ventil_position: 'vorlauf' } };
  e._ventilFelder();
  assert.equal(schemas, 1);
});

test('valve position fields have German and English labels and options', () => {
  for (const language of ['de', 'en']) {
    const e = new Editor();
    e._config = { sprache: language };
    e._hass = { language };
    for (const name of ['ventil_position', 'ruecklauf_anbindung']) {
      assert.ok(e._L()[name] && e._L()[name] !== name, `${language} label ${name}`);
      assert.ok(e._O()[name].length === 2, `${language} options ${name}`);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(e._O().ventil_position.map(([value]) => value))), ['ruecklauf', 'vorlauf']);
    assert.deepEqual(JSON.parse(JSON.stringify(e._O().ruecklauf_anbindung.map(([value]) => value))), ['gemeinsam', 'getrennt']);
  }
});
