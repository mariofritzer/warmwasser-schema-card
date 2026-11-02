const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cardClass } = require('./helpers/legacy-render.cjs');

const source = fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8');
const context = { HTMLElement: class {}, customElements: { get() {}, define() {} }, window: {}, console: { info() {} } };
const sensorReader = vm.runInNewContext(`${source}\nsensorReader`, context);
const state = (value, unit) => ({ state: value, attributes: { unit_of_measurement: unit } });

test('reader preserves missing states and unit fallbacks', () => {
  const r = sensorReader({ states: { 'sensor.value': state('0', ''), 'sensor.unit': state('1', 'kWh') } });
  for (const entity of ['', 'sensor.missing']) {
    assert.equal(r.S(entity), 'unknown');
    assert.equal(r.U(entity, 'W'), 'W');
    assert.equal(r.ON(entity), false);
    assert.equal(r.NUM(entity), 0);
  }
  assert.equal(r.S('sensor.value'), '0');
  assert.equal(r.U('sensor.value', 'W'), 'W');
  assert.equal(r.U('sensor.unit', 'W'), 'kWh');
});

test('reader preserves on and numeric conversion rules', () => {
  for (const [value, on, num] of [
    ['on', true, 0], ['ON', false, 0], ['off', false, 0], ['unknown', false, 0],
    ['0', false, 0], ['-2', false, -2], ['0.5', true, 0.5], ['', false, 0],
    [' ', false, 0], ['0x10', true, 16], ['1e2', true, 100],
    [0, false, 0], [null, false, 0], [undefined, false, 0],
    [false, false, 0], [true, false, 0], ['Infinity', false, 0],
  ]) {
    const r = sensorReader({ states: { 'sensor.test': state(value) } });
    assert.equal(r.S('sensor.test'), value);
    assert.equal(r.ON('sensor.test'), on, `ON for ${String(value)}`);
    assert.equal(r.NUM('sensor.test'), num, `NUM for ${String(value)}`);
  }
});

test('each render reads the current hass object', () => {
  const Card = cardClass(source);
  const card = new Card();
  card.setConfig({ wp: { betrieb: 'sensor.operation' } });
  card._hass = { states: { 'sensor.operation': state('off') }, language: 'en' };
  assert.ok(card._render().includes('Standby'));
  card._hass = { states: { 'sensor.operation': state('on') }, language: 'en' };
  assert.ok(card._render().includes('Compressor on'));
});
