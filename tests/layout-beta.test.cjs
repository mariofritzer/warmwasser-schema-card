const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cardClass } = require('./helpers/legacy-render.cjs');

// Hidden per-card beta: `layout_editor_beta: true` plus `layout: { version: 1 }`.
const Card = cardClass(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8'));
const hass = { language: 'de', states: {
  'sensor.fm_temp': { state: '40.3' }, 'binary_sensor.fm': { state: 'on' }, 'sensor.ww': { state: '42.8' },
  'sensor.top': { state: '40.5' }, 'sensor.bottom': { state: '36.5' }, 'sensor.wp': { state: '1200' } } };
const config = (extra = {}, typ = 'getrennt') => ({ sprache: 'de', hersteller: 'M-TEC', speicher: { typ },
  fm: { temp: 'sensor.fm_temp', pumpe: 'binary_sensor.fm' },
  fuehler: [{ name: 'Warmwasser', entity: 'sensor.ww', hoehe: 20 }, { name: 'Puffer oben', entity: 'sensor.top', hoehe: 68 }, { name: 'Puffer unten', entity: 'sensor.bottom', hoehe: 90 }],
  ...extra });
// Objects come from the vm realm; compare plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));
function render(cfg) {
  const card = new Card(); card.setConfig(cfg); card._hass = hass;
  const html = card._renderWithLayout();
  return { card, html };
}

test('without the beta option a saved layout is ignored byte for byte', () => {
  const standard = render(config()).html;
  const saved = render(config({ layout: { version: 1, fm: { x: 40, y: 60 } } }));
  assert.equal(saved.html, standard);
  assert.equal(saved.card._layoutResult, null);
});

test('beta option without layout or with zero offsets renders the standard diagram', () => {
  const standard = render(config()).html;
  assert.equal(render(config({ layout_editor_beta: true })).html, standard);
  const zero = render(config({ layout_editor_beta: true, layout: { version: 1, fm: { x: 0, y: 0 } } }));
  assert.equal(zero.html, standard);
  assert.equal(zero.card._layoutResult.status, 'none');
});

test('a valid layout moves components, routes pipes and moves the legend with the module', () => {
  const { card, html } = render(config({ layout_editor_beta: true, layout: { version: 1, fm: { x: 40, y: 60 }, puffer: { x: 150, y: 0 } } }));
  assert.equal(card._layoutResult.status, 'applied');
  assert.deepEqual(plain(card._drawnModel.components.fm.origin), { x: 380, y: 74 });
  assert.equal(card._drawnModel.components['buffer-tank'].origin.x, 222);
  // Sensors and feet follow their tank.
  assert.equal(card._drawnModel.components['sensor-1'].origin.x, 152);
  assert.equal(card._drawnModel.components['tank-feet'].origin.x, 243);
  assert.match(html, /<text x="445" y="182"[^>]*>SPEICHER<\/text>/);
  assert.doesNotMatch(html, /layout-note/);
});

test('both tanks move together with the speicher key', () => {
  const { card } = render(config({ layout_editor_beta: true, layout: { version: 1, speicher: { x: -40, y: 0 } } }));
  assert.equal(card._layoutResult.status, 'applied');
  assert.equal(card._drawnModel.components['hot-tank'].origin.x, 32);
  assert.equal(card._drawnModel.components['buffer-tank'].origin.x, 32);
});

test('a single tank uses the speicher key', () => {
  const { card } = render(config({ layout_editor_beta: true, layout: { version: 1, speicher: { x: -40, y: 0 }, fm: { x: 20, y: 40 } } }, 'schicht'));
  assert.equal(card._layoutResult.status, 'applied');
  assert.equal(card._drawnModel.components.tank.origin.x, 32);
});

test('overlapping components fall back to the standard diagram with a notice', () => {
  const standard = render(config()).html;
  const { card, html } = render(config({ layout_editor_beta: true, layout: { version: 1, fm: { x: -300, y: 60 } } }));
  assert.deepEqual(plain(card._layoutResult), { status: 'unsupported', code: 'collision' });
  assert.ok(html.startsWith(standard));
  assert.match(html, /class="layout-note"/);
});

test('buffer sensor plates may not overlap the hot-water tank', () => {
  const { card } = render(config({ layout_editor_beta: true, layout: { version: 1, puffer: { x: 60, y: -150 } } }));
  assert.equal(card._layoutResult.code, 'collision');
});

test('a position without a clear route falls back instead of throwing', () => {
  const { card, html } = render(config({ layout_editor_beta: true, layout: { version: 1, fm: { x: 0, y: -140 } } }));
  assert.equal(card._layoutResult.status, 'unsupported');
  assert.notEqual(card._layoutResult.code, 'collision');
  assert.match(html, /class="layout-note"/);
});

test('unsupported configurations, versions and ranges are reported', () => {
  const wp = render(config({ layout_editor_beta: true, wp: { leistung: 'sensor.wp' }, layout: { version: 1, fm: { x: 40, y: 60 } } }));
  assert.deepEqual(plain(wp.card._layoutResult), { status: 'unsupported', code: 'unsupported-configuration' });
  const version = render(config({ layout_editor_beta: true, layout: { version: 2, components: {} } }));
  assert.deepEqual(plain(version.card._layoutResult), { status: 'invalid', code: 'unsupported-version' });
  const range = render(config({ layout_editor_beta: true, layout: { version: 1, fm: { x: 5000, y: 0 } } }));
  assert.deepEqual(plain(range.card._layoutResult), { status: 'invalid', code: 'out-of-range' });
  const unknown = render(config({ layout_editor_beta: true, layout: { version: 1, wp: { x: 20, y: 0 } } }));
  assert.equal(unknown.card._layoutResult.code, 'unsupported-configuration');
});

test('a long live value falls back and recovers on the next update', () => {
  const cfg = config({ layout_editor_beta: true, layout: { version: 1, fm: { x: 40, y: 60 } } });
  const card = new Card(); card.setConfig(cfg);
  card._hass = { ...hass, states: { ...hass.states, 'sensor.fm_temp': { state: '123456.789' } } };
  card._renderWithLayout();
  assert.deepEqual(plain(card._layoutResult), { status: 'unsupported', code: 'label-overflow' });
  assert.equal(card._model, card._baseModel);
  card._hass = hass;
  card._renderWithLayout();
  assert.equal(card._layoutResult.status, 'applied');
});
