const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cardClass, readSource, hash } = require('./helpers/legacy-render.cjs');

// Diverter valve in the heat pump supply: wp.ventil_position: vorlauf
// (+ wp.ruecklauf_anbindung: gemeinsam | getrennt).
const Card = cardClass(readSource(path.join(__dirname, '../warmwasser-schema-card.js')));
const plain = (value) => JSON.parse(JSON.stringify(value));
const state = (value, unit) => ({ state: String(value), attributes: unit ? { unit_of_measurement: unit } : {} });
const farben = { warm: '#ff0000', kalt: '#0000ff' };
const sensors = [{ name: 'Warmwasser', entity: 'sensor.ww', hoehe: 20 }, { name: 'Puffer oben', entity: 'sensor.po', hoehe: 68 }, { name: 'Puffer unten', entity: 'sensor.pu', hoehe: 90 }];
const baseStates = { 'sensor.ww': state(47.2, '°C'), 'sensor.po': state(40.6, '°C'), 'sensor.pu': state(36.6, '°C'), 'sensor.fm': state(42.3, '°C'),
  'binary_sensor.run': state('on'), 'sensor.valve': state('warmwasser'), 'sensor.vl': state(35.2, '°C'), 'sensor.rl': state(37.2, '°C'),
  'sensor.qi': state(8.2, '°C'), 'sensor.qo': state(7, '°C'), 'sensor.cool': state('off') };
const config = ({ typ = 'getrennt', fm = true, wp = {}, ...rest } = {}) => ({ sprache: 'de', farben, speicher: { typ }, fuehler: sensors,
  ...(fm ? { fm: { temp: 'sensor.fm' } } : {}),
  wp: { typ: 'luft', betrieb: 'binary_sensor.run', ventil: 'sensor.valve', vorlauf: 'sensor.vl', ruecklauf: 'sensor.rl', ...wp }, ...rest });
function make(cfg, states = baseStates) {
  const card = new Card(); card.setConfig(cfg); card._hass = { language: 'de', states };
  return card;
}
const render = (cfg, states) => make(cfg, states)._render();
const supply = (extra = {}) => config({ wp: { ventil_position: 'vorlauf', ...extra } });

test('without the new options the diagram is unchanged', () => {
  const standard = render(config());
  assert.equal(render(config({ wp: { ventil_position: 'ruecklauf' } })), standard);
  assert.equal(render(config({ wp: { ventil_position: 'ruecklauf', ruecklauf_anbindung: 'getrennt' } })), standard);
  assert.equal(render(config({ wp: { ventil_position: 'unbekannt' } })), standard);
  const m = make(config())._model;
  assert.ok(m.connections['wp-valve-return'] && !m.connections['wp-valve-supply'] && !m.junctions['return-junction']);
});

test('ventil accepts an entity only; a boolean no longer creates a click target', () => {
  const missing = render(config({ wp: { ventil: undefined } }));
  assert.equal(render(config({ wp: { ventil: true } })), missing);
  assert.equal(render(config({ wp: { ventil: false } })), missing);
  assert.doesNotMatch(render(config({ wp: { ventil: true } })), /data-more="true"/);
  assert.match(render(config()), /data-more="sensor\.valve"/);
});

test('model: the valve sits in the supply and the returns join at a junction', () => {
  const m = make(supply())._model, ym = m.geometry.ym;
  assert.deepEqual(plain(Object.keys(m.components.valve.ports)), ['upper', 'lower', 'wp']);
  for (const port of Object.values(m.components.valve.ports)) assert.equal(port.role, 'supply');
  assert.deepEqual(plain(Object.keys(m.components.wp.ports)), ['upper-supply', 'return']);
  assert.deepEqual(plain(m.junctions['return-junction']).x, 310);
  assert.equal(m.junctions['return-junction'].y, ym + 26);
  const edge = (id) => [m.connections[id].from, m.connections[id].to, ...m.connections[id].via];
  assert.deepEqual(plain(edge('wp-valve-supply')), ['wp.upper-supply', 'valve.wp']);
  assert.deepEqual(plain(edge('wp-upper-supply')), ['valve.upper', 'hot-tank.wp-supply']);
  assert.deepEqual(plain(edge('wp-lower-supply')), ['valve.lower', 'buffer-tank.lower-supply']);
  assert.deepEqual(plain(edge('wp-upper-return')), ['hot-tank.wp-return', 'return-junction']);
  assert.deepEqual(plain(edge('wp-lower-return')), ['buffer-tank.lower-return', 'return-junction']);
  assert.deepEqual(plain(edge('wp-return')), ['return-junction', 'wp.return']);
  assert.equal(m.routingScope.fm, false, 'free routing does not cover this variant yet');
});

test('model: separate returns use two heat pump connections', () => {
  const m = make(supply({ ruecklauf_anbindung: 'getrennt' }))._model, ym = m.geometry.ym;
  assert.deepEqual(plain(Object.keys(m.components.wp.ports)), ['upper-supply', 'return', 'return-lower']);
  assert.ok(!m.junctions['return-junction'] && !m.connections['wp-return']);
  assert.equal(m.connections['wp-upper-return'].to, 'wp.return');
  assert.equal(m.connections['wp-lower-return'].to, 'wp.return-lower');
  assert.equal(m.components.wp.origin.y + m.components.wp.ports['return-lower'].y, ym + 44);
});

test('every tank type, with and without module and ground probe, draws finite geometry', () => {
  for (const typ of ['trennblech', 'schicht', 'kombi', 'hygiene', 'getrennt']) for (const fm of [false, true])
    for (const ruecklauf_anbindung of ['gemeinsam', 'getrennt']) for (const sole of [false, true]) {
      const cfg = config({ typ, fm, wp: { ventil_position: 'vorlauf', ruecklauf_anbindung, ...(sole ? { typ: 'sole', quelle_ein: 'sensor.qi', quelle_aus: 'sensor.qo' } : {}) } });
      if (typ === 'kombi' || typ === 'hygiene') delete cfg.fm;
      const html = render(cfg), label = `${typ} fm=${fm} ${ruecklauf_anbindung} sole=${sole}`;
      assert.doesNotMatch(html, /NaN|undefined|Infinity/, label);
      assert.ok((html.match(/class="w1"/g) || []).length >= 5, label);
    }
});

test('the valve takes the supply colour, also when cooling', () => {
  const ym = make(supply())._model.geometry.ym, dot = (html) => html.match(new RegExp(`<circle cx="262" cy="${ym}" r="2.5" fill="([^"]+)"`))[1];
  assert.equal(dot(render(config())), farben.kalt);
  assert.equal(dot(render(supply())), farben.warm);
  const cooling = supply({ kuehlen: 'sensor.cool' });
  assert.equal(dot(render(cooling, { ...baseStates, 'sensor.cool': state('on') })), farben.kalt);
});

test('the valve state animates the branch that is charged', () => {
  const ym = make(supply())._model.geometry.ym;
  const animated = (html, start) => new RegExp(`<path d="${start}[^"]*" class="w3"`).test(html);
  const upper = `M262 ${ym - 14}`, lower = `M262 ${ym + 14}`;
  const hot = render(supply(), baseStates), heat = render(supply(), { ...baseStates, 'sensor.valve': state('heizung') });
  assert.ok(animated(hot, upper) && !animated(hot, lower));
  assert.ok(!animated(heat, upper) && animated(heat, lower));
  assert.ok(animated(hot, 'M350 146') && animated(heat, 'M350 146'), 'the supply to the valve flows while the pump runs');
});

test('the heat pump draws its connection stubs for the variant', () => {
  const stubs = (html) => (html.match(/<rect x="[\d.]+" y="[\d.]+" width="\d+" height="\d+" rx="2" class="wk"\/>/g) || []).length;
  const standard = stubs(render(config())), combined = stubs(render(supply())), separate = stubs(render(supply({ ruecklauf_anbindung: 'getrennt' })));
  assert.equal(combined, standard - 1 + 0, 'top and one return instead of top, lower supply and return');
  assert.equal(separate, combined + 1);
});

test('unsupported combinations are rejected with a clear message', () => {
  const heating = [{ name: 'Kreis', pumpe: 'sensor.pump' }];
  assert.throws(() => make({ ...supply(), heizkreise: heating }), /Heizkreisen noch nicht unterstützt/);
  assert.throws(() => make({ ...supply({ wmz: 'sensor.meter' }) }), /Wärmemengenzähler/);
  assert.throws(() => make({ ...supply(), speicher: { typ: 'getrennt', trennung: 70 } }), /Trennung/);
  assert.doesNotThrow(() => make({ ...config({ wp: { ventil_position: 'ruecklauf' } }), heizkreise: heating }));
});

// Characterization of the reviewed drawings: the hash changes only with the markup.
// Regenerate deliberately with UPDATE_FIXTURES=1 after reviewing the new drawings.
const variants = {
  'split-fm-combined': supply(),
  'split-fm-separate': supply({ ruecklauf_anbindung: 'getrennt' }),
  'split-no-fm': config({ fm: false, wp: { ventil_position: 'vorlauf' } }),
  'split-fm-brine': supply({ typ: 'sole', quelle_ein: 'sensor.qi', quelle_aus: 'sensor.qo' }),
  'stratified-fm': config({ typ: 'schicht', wp: { ventil_position: 'vorlauf' } }),
  'baffle-no-fm': config({ typ: 'trennblech', fm: false, wp: { ventil_position: 'vorlauf' } }),
  'combi': { ...config({ typ: 'kombi', fm: false, wp: { ventil_position: 'vorlauf' } }) },
};
const fixturePath = path.join(__dirname, 'fixtures/valve-supply-render-sha256.json');
test('reviewed drawings keep their markup', () => {
  if (process.env.UPDATE_FIXTURES === '1')
    fs.writeFileSync(fixturePath, JSON.stringify(Object.fromEntries(Object.entries(variants).map(([name, cfg]) => [name, hash(render(cfg))])), null, 2) + '\n');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.deepEqual(Object.keys(fixture).sort(), Object.keys(variants).sort());
  for (const [name, cfg] of Object.entries(variants)) assert.equal(hash(render(cfg)), fixture[name], name);
});
