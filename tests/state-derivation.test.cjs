const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cardClass } = require('./helpers/legacy-render.cjs');

const source = fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8');
const FixedDate = class extends Date { static now() { return Date.parse('2025-03-15T12:00:00Z'); } };
const context = { Date: FixedDate, HTMLElement: class {}, customElements: { get() {}, define() {} }, window: {}, console: { info() {} } };
const api = vm.runInNewContext(`${source}\n({sensorReader, tankState, heaterState, heatPumpState, freshWaterState, heatPumpDisplay, additionalHeatState, solarState, energyState, legionellaState, sourcePumpState})`, context);
const L = { hsO: 'top', hsU: 'bottom', sperre: 'lock', abtauen: 'defrost', kuehlen: 'cool', waerme: 'heat', wpAn: 'running', wpAus: 'standby', typ: { kamin: 'fire', fernwaerme: 'district' }, auto: 'auto', hand: 'manual', modusAus: 'off', legLaeuft: 'active', legHeute: 'today', legVor: n => `${n} days` };
const F = { warm: 'red', kalt: 'blue', led: 'green', aktiv: 'orange' };
function reader(values = {}) {
  return api.sensorReader({ states: Object.fromEntries(Object.entries(values).map(([key, value]) => [`sensor.${key}`, { state: value, attributes: {} }])) });
}
function pump(values = {}, extra = {}) {
  const r = reader(values);
  const c = { wp: { typ: 'luft', schwelle: 100, leistung: 'sensor.power', ...extra } };
  return { c, r, p: api.heatPumpState(c, L, F, r.S, r.ON, r.NUM) };
}
function water(c, r, p, fm = null, circulation = false) {
  return { ...api.freshWaterState(c, fm, circulation, r.S, r.ON, r.NUM), ...api.heatPumpDisplay(c, p, L, F, r.S, r.NUM) };
}

test('heat pump uses a strict power threshold and explicit operation and lock take precedence', () => {
  assert.equal(pump({ power: '100' }).p.wp_on, false);
  assert.equal(pump({ power: '100.1' }).p.wp_on, true);
  assert.equal(pump({ power: '500', operation: 'off' }, { betrieb: 'sensor.operation' }).p.wp_on, false);
  assert.equal(pump({ power: '0', operation: 'on' }, { betrieb: 'sensor.operation' }).p.wp_on, true);
  const { c, r, p } = pump({ power: '500', lock: 'on', defrost: 'on', cool: 'on' }, { sperre: 'sensor.lock', abtauen: 'sensor.defrost', kuehlen: 'sensor.cool' });
  assert.equal(p.wp_on, false);
  assert.equal(water(c, r, p).wpStatus[0], 'lock');
  const d = pump({ power: '500', defrost: 'on', cool: 'on' }, { abtauen: 'sensor.defrost', kuehlen: 'sensor.cool' });
  assert.equal(water(d.c, d.r, d.p).wpStatus[0], 'defrost');
  const cooling = pump({ power: '500', cool: 'on' }, { kuehlen: 'sensor.cool' });
  assert.equal(water(cooling.c, cooling.r, cooling.p).wpStatus[0], 'cool');
  assert.equal(cooling.p.CW, 'blue');
  const standby = pump({ power: '0', cool: 'on' }, { kuehlen: 'sensor.cool' });
  assert.equal(water(standby.c, standby.r, standby.p).wpStatus[0], 'standby');
});

test('valve values determine upper and lower flows including strict boundaries', () => {
  for (const [value, fraction, upper, lower] of [
    ['0', 0, false, true], ['0.04', 0.04, false, true], ['0.96', 0.96, true, false], ['1', 1, true, false],
    ['35', 0.35, true, true], ['150', 1, true, false], ['-2', 0, false, true],
    ['Warmwasser', 1, true, false], ['heizung', 0, false, true], ['unknown', null, true, true],
  ]) {
    const { p } = pump({ power: '500', valve: value }, { ventil: 'sensor.valve' });
    assert.equal(p.vb, fraction, value); assert.equal(p.wpO, upper, value); assert.equal(p.wpU, lower, value);
  }
});

test('heater step overrides power, truncates, and power threshold is strict', () => {
  for (const [step, power, expected] of [['0', '500', false], ['0.9', '500', false], ['1.9', '0', true], ['unknown', '500', false]]) {
    const r = reader({ step, power });
    const result = api.heaterState({ heizstab_oben: { stufe: 'sensor.step', leistung: 'sensor.power' } }, L, r.S, r.NUM);
    assert.equal(result.hso.on, expected, step);
  }
  for (const [power, expected] of [['5', false], ['5.1', true], ['-1', false], ['unknown', false]]) {
    const r = reader({ power });
    assert.equal(api.heaterState({ heizstab_unten: { leistung: 'sensor.power' } }, L, r.S, r.NUM).hsu.on, expected, power);
  }
});

test('solar pump takes precedence over power and fallback threshold is strict', () => {
  for (const [power, expected] of [['10', false], ['10.1', true], ['unknown', false]]) {
    const r = reader({ power });
    assert.equal(api.solarState({ solar: { leistung: 'sensor.power' } }, r.ON, r.NUM).so_on, expected);
  }
  const r = reader({ power: '500', pump: 'off' });
  assert.equal(api.solarState({ solar: { leistung: 'sensor.power', pumpe: 'sensor.pump' } }, r.ON, r.NUM).so_on, false);
});

test('fresh water draw threshold and explicit pump precedence', () => {
  for (const [flow, draw] of [['0.1', false], ['0.11', true]]) {
    const { c, r, p } = pump({ flow, pump: 'off' });
    const w = water(c, r, p, { durchfluss: 'sensor.flow', pumpe: 'sensor.pump' });
    assert.equal(w.zapf, draw); assert.equal(w.fm_on, false);
    assert.equal(water(c, r, p, { durchfluss: 'sensor.flow' }).fm_on, draw);
  }
});

test('additional heat respects burner, pump and temperature precedence', () => {
  function heat(typ, values, extra = {}) {
    const r = reader(values);
    return api.additionalHeatState({ kamin: { typ, warm: 30, feuer: 35, temp: 'sensor.temp', ...extra } }, L, F, r.S, r.ON);
  }
  assert.equal(heat('kamin', { temp: '30' }).k_glut, true);
  assert.equal(heat('kamin', { temp: '35' }).k_feuer, true);
  assert.equal(heat('kamin', { temp: '90', burner: 'off' }, { brenner: 'sensor.burner' }).k_feuer, false);
  assert.equal(heat('fernwaerme', { temp: '90', pump: 'off' }, { pumpe: 'sensor.pump' }).k_feuer, false);
  assert.equal(heat('fernwaerme', { temp: 'unknown', pump: 'on' }, { pumpe: 'sensor.pump' }).k_feuer, true);
});

test('tank sensors and energy retain negative and missing readings', () => {
  const r = reader({ cold: '-5', warm: '15', missing: 'unknown', negative: '-2', zero: '0' });
  const tank = api.tankState({ typ: 'schicht', t_min: 0, t_max: 80, fuehler: [{ entity: 'sensor.cold', hoehe: 100 }, { entity: 'sensor.warm', hoehe: 0 }, { entity: 'sensor.missing' }] }, r.S, 195);
  assert.equal(tank.avg, 5); assert.equal(tank.fl[0].wert, '15'); assert.equal(tank.fl[2].wert, '-5');
  assert.equal(tank.col('unknown'), 'rgb(138,144,153)');
  const energy = api.energyState({ energie: ['negative', 'zero', 'missing'].map(x => ({ entity: `sensor.${x}` })) }, r.NUM);
  assert.deepEqual(Array.from(energy.vals), [-2, 0, 0]); assert.equal(energy.max, 0.001);
});

test('rendering re-derives state from a new hass object', () => {
  const Card = cardClass(source); const card = new Card();
  card.setConfig({ wp: { betrieb: 'sensor.operation' }, energie: [{ entity: 'sensor.energy' }] });
  card._hass = { language: 'en', states: { 'sensor.operation': { state: 'off' }, 'sensor.energy': { state: '-2', attributes: { unit_of_measurement: 'MWh' } } } };
  assert.match(card._render(), /Standby/); assert.match(card._render(), /-2 MWh/);
  card._hass = { language: 'en', states: { 'sensor.operation': { state: 'on' }, 'sensor.energy': { state: '3', attributes: {} } } };
  assert.match(card._render(), /Compressor on/); assert.match(card._render(), /3 kWh/);
});


test('legionella state prioritizes activity and handles age and date boundaries', () => {
  function state(last, active = 'off') {
    const r = reader({ last, active });
    return api.legionellaState({ letzte: 'sensor.last', aktiv: 'sensor.active', tage: 7 }, L, F, r.S, r.ON);
  }
  assert.equal(state('100', 'on').t, 'active');
  for (const [last, text, color] of [
    ['0', 'today', 'green'], ['7', '7 days', 'green'], ['8', '8 days', 'red'],
    ['2025-03-08T12:00:00Z', '7 days', 'green'], ['2025-03-07T12:00:00Z', '8 days', 'red'],
    ['2025-03-16T12:00:00Z', 'today', 'green'], ['invalid', '', '#8a9099'],
  ]) {
    const result = state(last); assert.equal(result.t, text, last); assert.equal(result.lc, color, last);
  }
});

test('source pump can run independently of the heat pump', () => {
  const r = reader({ source: 'on', off: 'off' });
  assert.equal(api.sourcePumpState({ quelle_pumpe: 'sensor.source' }, false, r.ON), true);
  assert.equal(api.sourcePumpState({ quelle_pumpe: 'sensor.off' }, false, r.ON), false);
  assert.equal(api.sourcePumpState({}, false, r.ON), false);
  assert.equal(api.sourcePumpState({ quelle_pumpe: 'sensor.off' }, true, r.ON), true);
});
