const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const registry = new Map();
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../warmwasser-schema-card.js'), 'utf8'), {
  HTMLElement: class {}, customElements: { get: n => registry.get(n), define: (n, c) => registry.set(n, c) }, window: {}, console: { info() {} },
});
const Card = registry.get('warmwasser-schema-card');
const config = (typ = 'getrennt', trennung = 50) => ({ speicher: { typ, trennung }, fm: { pumpe: 'switch.fm' }, wp: { betrieb: 'binary_sensor.wp' }, heizkreise: [{ pumpe: 'switch.hk' }] });
const card = (cfg = config()) => { const x = new Card(); x.setConfig(cfg); x._hass = { states: {}, language: 'de' }; return x; };

test('components, ports, connections and junction references are consistent', () => {
  for (const typ of ['getrennt', 'trennblech', 'schicht', 'kombi', 'hygiene']) for (const split of [35, 50, 70]) {
    const m = card(config(typ, split))._model;
    for (const [id, component] of Object.entries(m.components)) {
      assert.equal(id, component.id);
      for (const [name, port] of Object.entries(component.ports)) { assert.equal(name, port.id); assert.ok(['heating-water', 'domestic-water', 'solar-loop', 'district-loop', 'source-loop'].includes(port.medium)); }
    }
    const resolve = ref => { if (m.junctions[ref]) return m.junctions[ref]; const [id, name] = ref.split('.'); return m.components[id]?.ports[name]; };
    for (const [id, c] of Object.entries(m.connections)) {
      assert.equal(id, c.id); assert.ok(resolve(c.from), c.from); assert.ok(resolve(c.to), c.to);
      assert.equal(resolve(c.from).medium, resolve(c.to).medium);
      for (const j of c.via) assert.ok(m.junctions[j]);
    }
    for (const id of ['supply-tee', 'return-tee']) {
      const degree = Object.values(m.connections).reduce((n, c) => n + (c.from === id ? 1 : 0) + (c.to === id ? 1 : 0) + (c.via.includes(id) ? 2 : 0), 0);
      assert.equal(degree, 3);
    }
    assert.ok(m.junctions['manifold-supply-0']); assert.ok(m.junctions['manifold-return-0']);
    assert.equal(Boolean(m.components.fm), !['kombi', 'hygiene'].includes(typ));
    assert.equal(Boolean(m.components['hot-tank']), typ === 'getrennt');
  }
});

test('reconfiguration replaces topology and state changes do not', () => {
  const x = card(); const first = x._model; x._hass.states['binary_sensor.wp'] = { state: 'on' }; x._render(); assert.equal(x._model, first);
  x._hass = null; x.setConfig({ speicher: { typ: 'hygiene' }, heizkreise: [{ pumpe: 'switch.hk' }], weiche: true });
  assert.notEqual(x._model, first); assert.ok(x._model.components.separator); assert.ok(!x._model.components.wp); assert.ok(!x._model.components.fm);
  x.setConfig({ speicher: { typ: 'schicht' }, zirkulationspumpe: 'switch.zirk' }); assert.ok(x._model.components.fm); assert.ok(!x._model.components.separator);
});

test('moving the FM moves its body, visible stub and pipe endpoint together', () => {
  const x = card({ speicher: { typ: 'getrennt' }, fm: true }); x._model.components.fm.origin.x += 10;
  const svg = x._render();
  assert.ok(svg.includes('<rect x="350" y="14" width="110" height="90"'));
  assert.ok(svg.includes('<rect x="342" y="40" width="10" height="12"'));
  assert.ok(svg.includes('M206 46L'));
});


test('junction coordinates drive the tee and its connected branch', () => {
  const x = card(); x._model.junctions['supply-tee'].x = 290;
  x._model.junctions['return-tee'].x = 235;
  const svg = x._render();
  assert.ok(svg.includes('M290 227V'));
  assert.ok(svg.includes('H243Q235 360 235 352V340'));
  assert.ok(svg.includes('cx="290" cy="227"'));
});

test('the connection reference selects both the pipe endpoint and its stub', () => {
  const x = card(); x._model.connections['fm-supply'].to = 'fm.return';
  const svg = x._render();
  assert.ok(svg.includes('M206 46H336V90'));
  const returnStub = '<rect x="332" y="84" width="10" height="12" rx="2" class="wk"/>';
  assert.equal(svg.split(returnStub).length - 1, 2);
});


test('valve and separator moved origins remain connected to the routes', () => {
  // Isolate legacy valve/separator geometry; moving WP with FM and a heating circuit is unsupported.
  const x = card({ ...config(), fm: undefined, weiche: true });
  x._model.components.valve.origin.x += 10;
  x._model.components.separator.origin.y += 10;
  const svg = x._render();
  assert.ok(svg.includes('V268.5H272'));
  assert.ok(svg.includes('H322V420'));
  assert.ok(svg.includes('H342V472'));
  assert.ok(svg.includes('<rect x="322" y="410" width="20" height="72"'));
});

test('legacy solar and additional heat use buffer tank ports and stubs', () => {
  // Solar/additional heat with a moved tank and FM is outside the routing scope.
  const x = card({ ...config(), fm: undefined, solar: { pumpe: 'switch.solar' }, zusatzwaerme: { pumpe: 'switch.fire' } });
  const b = x._model.components['buffer-tank'];
  assert.ok(b.ports['solar-supply']); assert.ok(b.ports['additional-return']);
  b.origin.x += 10;
  const svg = x._render();
  assert.ok(svg.includes('M80 340H-58'));
  assert.ok(svg.includes('H112Q120 395 120 387V374'));
  assert.ok(svg.includes('<rect x="114" y="368" width="12" height="8"'));
});


test('tee y coordinates remain on both continuous trunk paths', () => {
  const x = card(); x._model.junctions['supply-tee'].y += 10; x._model.junctions['return-tee'].y += 10;
  const svg = x._render();
  assert.ok(svg.includes('M326 227V237H268'));
  assert.ok(svg.includes('M206 340V350H252'));
  assert.ok(svg.includes('M295 237V'));
  assert.ok(svg.includes('V350'));
});


test('component geometry is finite and split tank ports belong to the correct tank', () => {
  for (const split of [35, 50, 70]) {
    const x = card({ ...config('getrennt', split), solar: { pumpe: 'switch.solar' } });
    const m = x._model, hot = m.components['hot-tank'], buffer = m.components['buffer-tank'];
    assert.equal(hot.origin.y + hot.bounds.height, 40 + 310 * split / 100 - 8);
    assert.equal(buffer.origin.y, 40 + 310 * split / 100 + 8);
    assert.ok(hot.ports['fm-supply'] && hot.ports['fm-return']);
    assert.ok(buffer.ports['lower-supply'] && buffer.ports['lower-return']);
    assert.equal(buffer.ports['solar-supply'].medium, 'solar-loop');
    assert.equal(buffer.ports['solar-return'].medium, 'solar-loop');
    assert.equal(m.connections['solar-coil'].from, 'buffer-tank.solar-supply');
    assert.equal(m.connections['solar-coil'].to, 'buffer-tank.solar-return');
    for (const component of Object.values(m.components)) {
      for (const n of [component.origin.x, component.origin.y, ...Object.values(component.bounds)]) assert.ok(Number.isFinite(n));
      if (!component.boundary) assert.ok(component.bounds.width > 0 && component.bounds.height > 0);
      for (const port of Object.values(component.ports)) {
        for (const n of [port.x, port.y, component.origin.x + port.x, component.origin.y + port.y, ...Object.values(port.stub || {})]) assert.ok(Number.isFinite(n));
      }
    }
  }
});

test('active heating overlay reaches the tank after moving the return tee', () => {
  const x = card(); x._hass.states['switch.hk'] = { state: 'on' };
  x._model.junctions['return-tee'].y += 10;
  assert.ok(x._render().includes('M240 350H206V340" class="w3"'));
});

test('attached sensors, heaters and tank details follow their parent tank', () => {
  const cfg = { ...config(), fuehler: [{ entity: 'sensor.top', name: 'Top', hoehe: 10 }], heizstab_oben: { leistung: 'sensor.heater' }, solar: { pumpe: 'switch.solar' } }; delete cfg.fm;
  const x = card(cfg);
  const m = x._model, sensor = m.components['sensor-0'], heater = m.components['upper-heater'];
  const sy = sensor.origin.y, hy = heater.origin.y;
  m.components['hot-tank'].origin.y += 12;
  assert.equal(sensor.origin.y, sy + 12); assert.equal(heater.origin.y, hy + 12);
  const svg = x._render();
  assert.ok(svg.includes('id="wwTemp-hot-tank" gradientUnits="userSpaceOnUse" x1="0" y1="26"'));
  assert.ok(svg.includes('fill="url(#wwTemp-hot-tank)"'));
  assert.ok(svg.includes('<g transform="translate(0 12)">'));
});

test('inline pumps explicitly connect their input and output', () => {
  const x = card({ ...config(), solar: { pumpe: 'switch.solar' }, zusatzwaerme: { pumpe: 'switch.fire' }, zirkulationspumpe: 'switch.zirk' });
  const m = x._model;
  for (const [edge, pump] of [['solar-pump-through', 'solar-pump'], ['additional-pump-through', 'additional-pump'], ['circulation-pump-through', 'circulation-pump'], ['heating-pump-through-0', 'heating-pump-0']]) {
    assert.equal(m.connections[edge].from, `${pump}.in`);
    assert.equal(m.connections[edge].to, `${pump}.out`);
  }
});

test('meters are transparent degree-two points on their pipes', () => {
  const x = card({ ...config(), wp: { betrieb: 'binary_sensor.wp', wmz: 'sensor.wp_energy' }, zusatzwaerme: { pumpe: 'switch.fire', wmz: 'sensor.fire_energy' }, trinkwasser: { zaehler: 'sensor.water_energy' } });
  for (const [id, edge] of [['wp-meter-point', 'wp-upper-supply'], ['additional-meter-point', 'additional-supply'], ['domestic-meter-point', 'domestic-cold']]) {
    const m = x._model; assert.equal(m.junctions[id].kind, 'meter');
    assert.ok(m.connections[edge].via.includes(id));
    assert.equal(Object.values(m.connections).reduce((n, c) => n + (c.from === id ? 1 : 0) + (c.to === id ? 1 : 0) + (c.via.includes(id) ? 2 : 0), 0), 2);
  }
});

test('the individual pump passage connection determines the drawn route', () => {
  const cfg = { ...config(), solar: { pumpe: 'switch.solar' }, zusatzwaerme: { pumpe: 'switch.fire' }, zirkulationspumpe: 'switch.zirk' };
  for (const [id, port] of [['solar-pump-through', 'solar-pump.out'], ['additional-pump-through', 'additional-pump.out'], ['circulation-pump-through', 'circulation-pump.out'], ['heating-pump-through-0', 'heating-pump-0.out']]) {
    const x = card(cfg), before = x._render(); x._model.connections[id].from = port;
    assert.notEqual(x._render(), before, `${id} must influence its route`);
  }
});

test('a bypass starts at the port or junction named by its own connection', () => {
  const x = card({ ...config(), heizkreise: [{ pumpe: 'switch.hk', mischer: 'sensor.mixer' }] });
  const edge = x._model.connections['heating-bypass-0'];
  const before = x._render();
  edge.from = 'heating-circuit-0.return';
  const after = x._render();
  assert.ok(before.includes('M186 482H169'));
  assert.ok(after.includes('M186 548H169V482'));
});

test('each rail uses its connection endpoints and places its end caps there', () => {
  for (const kind of ['supply', 'return']) {
    const x = card(), edge = x._model.connections[`manifold-${kind}`];
    const other = kind === 'supply' ? 'return' : 'supply';
    const original = x._render();
    edge.from = `manifolds.${other}-left`;
    const movedStart = x._render();
    const start = x._model.components.manifolds.ports[`${other}-left`];
    const base = x._model.components.manifolds.origin;
    assert.ok(movedStart.includes(`M${base.x + start.x} ${base.y + start.y}`));
    assert.notEqual(movedStart, original);
    edge.to = `manifolds.${other}-right`;
    const end = x._model.components.manifolds.ports[`${other}-right`];
    const movedEnd = x._render();
    assert.ok(movedEnd.includes(`H${base.x + end.x}V${base.y + end.y}`));
    assert.ok(movedEnd.includes(`<rect x="${base.x + end.x}" y="${base.y + end.y - 10}" width="5" height="20"`));
  }
});

test('a reversed supply overlay follows the same bent rail', () => {
  const x = card({ ...config(), heizkreise: [{ pumpe: 'switch.hk1' }, { pumpe: 'switch.hk2' }] });
  x._hass.states['switch.hk1'] = { state: 'on' }; x._hass.states['switch.hk2'] = { state: 'on' };
  x._model.junctions['manifold-supply-0'].y += 10;
  const svg = x._render();
  assert.ok(svg.includes('M130 420H154V430H239V420'));
  assert.ok(svg.includes('M295 420H239V430H154" class="w3"'));
});


test('separate tank FM return uses its left port and rounded connection', () => {
  for (const split of [35, 50, 70]) {
    const x = card(config('getrennt', split)), m = x._model, f = m.components.fm, port = f.ports.return;
    assert.equal(port.direction, 'left'); assert.equal(f.origin.x + port.x, 336); assert.equal(f.origin.y + port.y, 90);
    assert.deepEqual([f.origin.x + port.stub.x, f.origin.y + port.stub.y, port.stub.width, port.stub.height], [332, 84, 10, 12]);
    const y = m.geometry.bo - 14, radius = Math.min(8, Math.max(0, (y - 90) / 2));
    assert.ok(x._render().includes(`M336 90H${(y > 128 ? 322 : 315) + radius}Q${y > 128 ? 322 : 315} 90 ${y > 128 ? 322 : 315} ${90 + radius}V${y - radius}Q${y > 128 ? 322 : 315} ${y} ${(y > 128 ? 322 : 315) - radius} ${y}H206`));
  }
  const shared = card(config('schicht'))._model.components.fm;
  assert.equal(shared.ports.return.direction, 'right');
  assert.equal(shared.origin.x + shared.ports.return.x, 452);
});

test('upper heater and WP port use config-only crowded geometry', () => {
  for (const split of [35, 50, 70]) {
    for (const useFm of [false, true]) for (const useHeater of [false, true]) {
      const cfg = config('getrennt', split);
      if (!useFm) delete cfg.fm;
      if (useHeater) cfg.heizstab_oben = { leistung: 'sensor.heater' };
      const x = card(cfg), m = x._model, bo = 40 + 310 * split / 100 - 32;
      const ro = useFm && useHeater ? Math.min(70, bo - 54) : 70;
      const nominal = (ro + bo) / 2;
      const heaterY = useFm && useHeater && Math.abs(nominal - (bo - 14)) < 18 ? (ro + bo - 14) / 2 : nominal;
      assert.equal(m.geometry.ro, ro); assert.equal(m.geometry.heaterY, heaterY);
      assert.equal(m.components['hot-tank'].origin.y + m.components['hot-tank'].ports['wp-supply'].y, ro);
      if (useHeater) {
        const heater = m.components['upper-heater'];
        assert.equal(heater.parent, 'hot-tank'); assert.equal(heater.origin.y, heaterY - 13);
        assert.ok(x._render().includes(`M202 ${heaterY}h-10l-3-4`));
      }
    }
  }
  const x = card({ ...config('getrennt', 35), heizstab_oben: { leistung: 'sensor.heater' } });
  assert.ok(x._render().includes('V108.5A6 6 0 0 1 300 96.5'));
});

test('moving the FM moves its separate-tank return port, stub and rounded route', () => {
  const x = card({ speicher: { typ: 'getrennt', trennung: 35 }, fm: true });
  x._model.components.fm.origin.y += 5;
  const svg = x._render();
  assert.ok(svg.includes('<rect x="332" y="89" width="10" height="12"'));
  assert.match(svg, /M336 95L[^"]*Q/);
});

test('circulation alone activates the same upper heater clearance', () => {
  const cfg = config('getrennt', 35); delete cfg.fm;
  cfg.zirkulationspumpe = 'switch.zirk'; cfg.heizstab_oben = { leistung: 'sensor.heater' };
  const x = card(cfg);
  assert.ok(x._model.components.fm);
  assert.equal(x._model.geometry.ro, 62.5);
  assert.equal(x._model.geometry.heaterY, 82.5);
  assert.ok(x._render().includes('M202 82.5h-10l-3-4'));
});

test('moving the heat source moves its own endpoints and temperature arrows together', () => {
  for (const typ of ['wasser','sole']) {
    const x=card({speicher:{typ:'schicht'},wp:{typ,quelle_ein:'sensor.in',quelle_aus:'sensor.out'}});
    x._hass.states['sensor.in']={state:'10'}; x._hass.states['sensor.out']={state:'5'};
    x._model.components['heat-source'].origin.x+=20; x._model.components['heat-source'].origin.y+=10;
    const svg=x._render();
    assert.ok(svg.includes('<g transform="translate(20 10)"><rect x="382" y="404"'),`${typ}: device`);
    assert.ok(svg.includes('<g transform="translate(20 10)"><text x="444" y="426" font-size="8.5" class="wt wv wx" data-more="sensor.in">↑ 10.0°</text><text x="444" y="440" font-size="8.5" class="wt wv wx" data-more="sensor.out">↓ 5.0°</text></g>'),`${typ}: arrows and labels`);
    if (typ==='wasser') {
      assert.ok(svg.includes('d="M420 545V399'), 'inlet starts at moved source port');
      assert.ok(svg.includes('V545H450" class="w0"'), 'outlet ends at moved source port');
    } else assert.ok(svg.includes('V550H420Q420 562 435 562Q450 562 450 550'), 'ground loop follows both moved ports');
  }
});

test('moving a heating circuit moves its open arrows, name and pipe endpoints', () => {
  const x=card({speicher:{typ:'schicht'},heizkreise:[{name:'Test',pumpe:'switch.hk'}]});
  const branch=x._model.components['heating-circuit-0']; branch.origin.x+=20; branch.origin.y+=10;
  const svg=x._render();
  assert.ok(svg.includes('<g transform="translate(20 10)"><path d="M150 539l4 4 4-4M182 543l4-4 4 4" class="wa"/><text x="170" y="564" font-size="10" class="wc wt wv"'), 'arrows and name move with branch');
  assert.ok(svg.includes('d="M206 558V448H186" class="w0"'), 'return begins at moved branch port');
  assert.ok(svg.includes('V174V558" class="w0"') || svg.includes('H174V558" class="w0"'), 'supply ends at moved branch port');
});
