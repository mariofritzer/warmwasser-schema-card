const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cardClass } = require('./helpers/legacy-render.cjs');

// Hidden per-card beta: `layout_editor_beta: true` plus `layout: { version: 2 }`.
const Card = cardClass(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8'));
const hass = { language: 'de', states: {
  'sensor.fm_temp': { state: '40.3' }, 'binary_sensor.fm': { state: 'on' }, 'sensor.ww': { state: '42.8' },
  'sensor.top': { state: '40.5' }, 'sensor.bottom': { state: '36.5' }, 'sensor.wp': { state: '1200' } } };
const config = (extra = {}, typ = 'getrennt') => ({ sprache: 'de', hersteller: 'M-TEC', speicher: { typ },
  fm: { temp: 'sensor.fm_temp', pumpe: 'binary_sensor.fm' },
  fuehler: [{ name: 'Warmwasser', entity: 'sensor.ww', hoehe: 20 }, { name: 'Puffer oben', entity: 'sensor.top', hoehe: 68 }, { name: 'Puffer unten', entity: 'sensor.bottom', hoehe: 90 }],
  ...extra });
// Canonical origins: fm (340,14), hot-tank and tank (72,14), buffer-tank (72,203) at 50 % split.
const at = (components, ports) => ({ layout_editor_beta: true, layout: { version: 2, components, ...(ports ? { ports } : {}) } });
// Objects come from the vm realm; compare plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));
function render(cfg) {
  const card = new Card(); card.setConfig(cfg); card._hass = hass;
  const html = card._renderWithLayout();
  return { card, html };
}

test('the model declares left and right sides only for proven ports', () => {
  const { card } = render(config());
  const m = card._baseModel;
  assert.deepEqual(Object.keys(m.components.fm.ports.supply.sides).sort(), ['left', 'right']);
  assert.equal(m.components.fm.ports.supply.side, 'left');
  assert.equal(m.components['hot-tank'].ports['fm-supply'].side, 'right');
  assert.equal(m.components.fm.ports['cold-water'].sides, undefined);
  const single = render(config({}, 'schicht')).card._baseModel;
  assert.equal(single.components.tank.ports['fm-return'].sides, undefined);   // bottom connector stays fixed
  assert.ok(single.components.fm.ports.return.sides.left);
});

test('without the beta option a saved layout is ignored byte for byte', () => {
  const standard = render(config()).html;
  const saved = render({ ...config(), layout: { version: 2, components: { fm: { x: 380, y: 74 } } } });
  assert.equal(saved.html, standard);
  assert.equal(saved.card._layoutResult, null);
});

test('beta option without layout or with canonical positions renders the standard diagram', () => {
  const standard = render(config()).html;
  assert.equal(render(config({ layout_editor_beta: true })).html, standard);
  const same = render(config(at({ fm: { x: 340, y: 14 } })));
  assert.equal(same.html, standard);
  assert.equal(same.card._layoutResult.status, 'none');
});

test('a valid layout moves components, routes pipes and moves the legend with the module', () => {
  const { card, html } = render(config(at({ fm: { x: 380, y: 74 }, 'buffer-tank': { x: 222, y: 203 } })));
  assert.equal(card._layoutResult.status, 'applied');
  assert.deepEqual(plain(card._drawnModel.components.fm.origin), { x: 380, y: 74 });
  assert.equal(card._drawnModel.components['buffer-tank'].origin.x, 222);
  // Sensors and feet follow their tank.
  assert.equal(card._drawnModel.components['sensor-1'].origin.x, 152);
  assert.equal(card._drawnModel.components['tank-feet'].origin.x, 243);
  assert.match(html, /<text x="445" y="182"[^>]*>SPEICHER<\/text>/);
  assert.doesNotMatch(html, /layout-note/);
});

test('a single tank moves by its model id', () => {
  const { card } = render(config(at({ tank: { x: 32, y: 14 }, fm: { x: 360, y: 54 } }), 'schicht'));
  assert.equal(card._layoutResult.status, 'applied');
  assert.equal(card._drawnModel.components.tank.origin.x, 32);
});

test('overlapping components fall back to the standard diagram with a notice', () => {
  const standard = render(config()).html;
  const { card, html } = render(config(at({ fm: { x: 40, y: 74 } })));
  assert.equal(card._layoutResult.status, 'unsupported');
  assert.equal(card._layoutResult.code, 'collision');
  // The overlapping parts are named for the editor message.
  assert.deepEqual(plain(card._layoutResult.detail.a.group === 'fm' ? card._layoutResult.detail.b : card._layoutResult.detail.a).group, 'hot-tank');
  assert.ok(html.startsWith(standard));
  assert.match(html, /class="layout-note"/);
});

test('buffer sensor plates may not overlap the hot-water tank', () => {
  const { card } = render(config(at({ 'buffer-tank': { x: 132, y: 53 } })));
  assert.equal(card._layoutResult.code, 'collision');
});

test('a position without a clear route falls back instead of throwing', () => {
  const { card, html } = render(config(at({ fm: { x: 0, y: -120 } })));
  assert.equal(card._layoutResult.status, 'unsupported');
  assert.notEqual(card._layoutResult.code, 'collision');
  assert.match(html, /class="layout-note"/);
});

test('V1 layouts are rejected with an explanation', () => {
  const { card, html } = render(config({ layout_editor_beta: true, layout: { version: 1, fm: { x: 40, y: 60 } } }));
  assert.deepEqual(plain(card._layoutResult), { status: 'invalid', code: 'legacy-version' });
  assert.match(html, /das alte Format \(Version 1\)/);
});

test('invalid entries, versions, ranges and configurations are reported', () => {
  const code = (layout, extra = {}) => render(config({ layout_editor_beta: true, layout, ...extra })).card._layoutResult.code;
  assert.equal(code({ version: 3 }), 'unsupported-version');
  assert.equal(code({ version: 2, extra: {} }), 'invalid-layout');
  assert.equal(code({ version: 2, components: { pump: { x: 1, y: 1 } } }), 'unknown-id');
  assert.equal(code({ version: 2, components: { fm: { x: 'a', y: 1 } } }), 'invalid-position');
  assert.equal(code({ version: 2, components: { fm: { x: 5000, y: 14 } } }), 'out-of-range');
  assert.equal(code({ version: 2, components: { 'sensor-0': { x: 2, y: 80 } } }), 'unsupported-configuration');
  assert.equal(code({ version: 2, ports: { 'fm.cold-water': { mode: 'auto' } } }), 'unknown-port');
  assert.equal(code({ version: 2, ports: { 'fm.supply': { mode: 'manual', side: 'top' } } }), 'invalid-side');
  assert.equal(code({ version: 2, ports: { 'fm.supply': { mode: 'fixed' } } }), 'invalid-mode');
  assert.equal(code({ version: 2, components: { fm: { x: 380, y: 74 } } }, { wp: { leistung: 'sensor.wp', wmz: 'sensor.wp' } }), 'unsupported-configuration');
});

test('a long live value falls back and recovers on the next update', () => {
  const card = new Card(); card.setConfig(config(at({ fm: { x: 380, y: 74 } })));
  card._hass = { ...hass, states: { ...hass.states, 'sensor.fm_temp': { state: '123456.789' } } };
  card._renderWithLayout();
  assert.deepEqual(plain(card._layoutResult), { status: 'unsupported', code: 'label-overflow' });
  assert.equal(card._model, card._baseModel);
  card._hass = hass;
  card._renderWithLayout();
  assert.equal(card._layoutResult.status, 'applied');
});

test('the module can move to the left of the tanks; auto ports face each other', () => {
  const { card, html } = render(config(at({ fm: { x: -200, y: 14 } })));
  assert.equal(card._layoutResult.status, 'applied');
  const m = card._drawnModel;
  for (const name of ['fm-supply', 'fm-return']) assert.equal(m.components['hot-tank'].ports[name].side, 'left');
  for (const name of ['supply', 'return']) assert.equal(m.components.fm.ports[name].direction, 'right');
  // The drawing fits its content instead of growing by the full offset.
  const [x, , width] = html.match(/<svg viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(x > -260 && width < 560, `viewBox ${x} ${width}`);
});

test('a manual port side is kept even when auto would choose the other side', () => {
  const { card } = render(config(at({}, { 'fm.supply': { mode: 'manual', side: 'left' }, 'fm.return': { mode: 'auto' } })));
  assert.equal(card._layoutResult.status, 'applied');
  assert.equal(card._drawnModel.components.fm.ports.supply.side, 'left');
  // Auto may not override a manual side; such a layout is either drawn with it or rejected.
  const forced = render(config(at({ fm: { x: -200, y: 14 } }, { 'hot-tank.fm-supply': { mode: 'manual', side: 'right' } })));
  if (forced.card._layoutResult.status === 'applied') assert.equal(forced.card._drawnModel.components['hot-tank'].ports['fm-supply'].side, 'right');
  else assert.equal(forced.card._layoutResult.status, 'unsupported');
});

test('tanks below the module route both pipes without contact', () => {
  const { card } = render(config(at({ 'hot-tank': { x: -8, y: 114 }, 'buffer-tank': { x: -8, y: 303 } })));
  assert.equal(card._layoutResult.status, 'applied');
  assert.equal(card._drawnModel.components['hot-tank'].ports['fm-supply'].side, 'right');
});

test('sensor plates move to the tank side away from the module', () => {
  const { card, html } = render(config(at({ fm: { x: 125, y: 259 }, 'hot-tank': { x: 422, y: 84 }, 'buffer-tank': { x: 487, y: 353 } })));
  assert.equal(card._layoutResult.status, 'applied');
  const m = card._drawnModel;
  assert.equal(m.fmLeft, true);
  for (const id of ['sensor-0', 'sensor-1', 'sensor-2']) assert.equal(m.components[id].side, 'right');
  // Right-hand plate recipe: line from the tank edge, plate to its right.
  assert.match(html, /<line x1="202" y1="102" x2="214"/);
});

test('a module directly below the tank keeps the shorter side variant', () => {
  const { card } = render(config(at({ fm: { x: 260, y: 269 }, 'hot-tank': { x: 457, y: 79 }, 'buffer-tank': { x: 502, y: 353 } })));
  assert.equal(card._layoutResult.status, 'applied');
  assert.equal(card._drawnModel.fmLeft, true);
});

// Simple air-source heat pump: canonical wp (330,150), valve (228,268.5) at 50 % split.
const withWp = (components) => config({ wp: { leistung: 'sensor.wp' }, ...at(components) });

test('an air heat pump and its valve are movable; other heat pumps are not', () => {
  for (const [id, x, y] of [['wp', 450, 270], ['valve', 228, 428]]) assert.equal(render(withWp({ [id]: { x, y } })).card._layoutResult.status, 'applied', id);
  const meter = render(config({ wp: { leistung: 'sensor.wp', wmz: 'sensor.wp' }, ...at({ wp: { x: 450, y: 270 } }) })).card._layoutResult;
  assert.equal(meter.code, 'unsupported-configuration');
});

test('moving the heat pump routes all primary pipes with bridges where they cross', () => {
  const { card, html } = render(withWp({ wp: { x: 450, y: 270 } }));
  assert.equal(card._layoutResult.status, 'applied');
  assert.equal(Object.keys(card._drawnModel.layoutRoutes).length, 7);
  assert.match(html, /A6 6 0 0 [01]/);   // bridge arcs
});

test('the valve turns to face a heat pump on its left', () => {
  // Valve right of the heat pump: its side port faces left, the motor moves right.
  const { card, html } = render(withWp({ valve: { x: 380, y: 320 }, wp: { x: 330, y: 420 } }));
  assert.equal(card._layoutResult.status, 'applied');
  const v = card._drawnModel.components.valve;
  assert.equal(v.ports.wp.side, 'left');
  assert.equal(v.ports.upper.x, v.bounds.width - 34);
  const vx = v.origin.x + v.bounds.width - 34;
  assert.ok(html.includes(`<rect x="${vx + 18}" `), 'motor drawn on the right');
});

test('the valve symbol is mirrored together with its ports', () => {
  const { card } = render(withWp({}));
  const m = card._baseModel, v = m.components.valve;
  assert.equal(v.ports.wp.side, 'right');
  assert.deepEqual(plain(Object.keys(v.ports.wp.sides).sort()), ['left', 'right']);
  assert.equal(v.ports.wp.sides.left.x, 0);
  assert.equal(v.ports.wp.sides.left.siblings.upper, v.bounds.width - v.ports.upper.x);
  assert.equal(m.components.wp.ports['upper-supply'].sides, undefined);   // the top connector stays fixed
});

test('moving the valve down keeps the module pipes on the facing sides', () => {
  const { card } = render(withWp({ valve: { x: 228, y: 428 } }));
  assert.equal(card._layoutResult.status, 'applied');
  assert.equal(card._drawnModel.fmLeft, false);
  assert.equal(card._drawnModel.components['hot-tank'].ports['fm-supply'].side, 'right');
});

// Heaters belong to their tank; only the terminal box protrudes on the right.
const withHeaters = (extra, components) => config({ heizstab_oben: { leistung: 'sensor.wp' }, heizstab_unten: { leistung: 'sensor.wp' }, ...extra, ...at(components) });

test('cards with heaters are movable and heaters follow their tank', () => {
  const { card, html } = render(withHeaters({}, { 'hot-tank': { x: 32, y: 14 }, fm: { x: 380, y: 54 } }));
  assert.equal(card._layoutResult.status, 'applied');
  const m = card._drawnModel;
  assert.equal(m.components['upper-heater'].origin.x, 66);
  assert.ok(m.components['upper-heater'].routingAreas.length === 1);
  assert.match(html, /Heizstab oben/);
  const wp = render(withHeaters({ wp: { leistung: 'sensor.wp' } }, { wp: { x: 450, y: 270 } }));
  assert.equal(wp.card._layoutResult.status, 'applied');
});

test('a tank with a heater keeps its sensor plates on the left', () => {
  const { card } = render(withHeaters({}, { fm: { x: -200, y: 14 } }));
  assert.equal(card._layoutResult.status, 'applied');
  assert.equal(card._drawnModel.components['hot-tank'].ports['fm-supply'].side, 'left');
  for (const id of ['sensor-0', 'sensor-1', 'sensor-2']) assert.notEqual(card._drawnModel.components[id].side, 'right');
});

test('pipes keep clear of the heater terminal box', () => {
  const { card } = render(withHeaters({ wp: { leistung: 'sensor.wp' } }, { wp: { x: 450, y: 270 } }));
  const m = card._drawnModel, h = m.components['upper-heater'], area = h.routingAreas[0];
  const box = { x: h.origin.x + area.x, y: h.origin.y + area.y, width: area.width, height: area.height };
  for (const route of Object.values(m.layoutRoutes)) for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i];
    const hit = Math.max(a.x, b.x) >= box.x - 5 && Math.min(a.x, b.x) <= box.x + box.width + 5 && Math.max(a.y, b.y) >= box.y - 5 && Math.min(a.y, b.y) <= box.y + box.height + 5;
    assert.ok(!hit, `segment ${JSON.stringify([a, b])} touches the heater terminal`);
  }
});

test('without its own position the valve follows the heat pump to the tank-facing side', () => {
  const left = render(withWp({ wp: { x: -260, y: 150 } }));
  assert.equal(left.card._layoutResult.status, 'applied');
  const m = left.card._drawnModel, pump = m.components.wp, valve = m.components.valve;
  assert.ok(valve.origin.x > pump.origin.x + pump.bounds.width, 'valve right of a heat pump on the left');
  assert.equal(valve.origin.y, valve.baseOrigin.y);
  assert.equal(valve.ports.wp.side, 'left');
  // An explicit valve position wins.
  const fixed = render(withWp({ wp: { x: 450, y: 270 }, valve: { x: 228, y: 428 } }));
  assert.deepEqual(plain(fixed.card._drawnModel.components.valve.origin), { x: 228, y: 428 });
});

test('a collision names the overlapping parts', () => {
  // Heat pump left of the buffer with the valve pinned right: the buffer's
  // sensor plates move right onto the valve.
  const { card } = render(withWp({ wp: { x: -200, y: 200 }, valve: { x: 228, y: 268 } }));
  assert.equal(card._layoutResult.code, 'collision');
  const parts = [card._layoutResult.detail.a, card._layoutResult.detail.b].map((p) => p.id).sort();
  assert.deepEqual(plain(parts), ['sensor-1', 'valve']);
});
