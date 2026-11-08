const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { scenarios } = require('./helpers/legacy-render.cjs');
const example = require('./fixtures/distributor-three.json');
const registry = new Map();
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8'), {
  HTMLElement: class { dispatchEvent(event) { this.lastEvent = event; } },
  CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
  customElements: { get: name => registry.get(name), define: (name, ctor) => registry.set(name, ctor) },
  window: {}, console: { info() {} },
});
const Card = registry.get('warmwasser-schema-card');
const plain = value => JSON.parse(JSON.stringify(value));
const sensor = state => ({ state: String(state), attributes: {} });
function create(slots = example.verteiler.anschluesse, extra = {}) {
  const card = new Card(); card.setConfig({ verteiler: { anschluesse: slots }, ...extra });
  card._hass = { language: 'de', states: { 'switch.pump': sensor('on'), 'sensor.vl': sensor(52), 'sensor.rl': sensor(38), 'sensor.wmz': { state: '123.4', attributes: { unit_of_measurement: 'kWh' } } } };
  return card;
}
function point(model, ref) {
  if (model.junctions[ref]) return model.junctions[ref];
  const [id, port] = ref.split('.'), component = model.components[id], anchor = component?.ports[port];
  assert.ok(anchor, ref);
  return { ...anchor, x: component.origin.x + anchor.x, y: component.origin.y + anchor.y };
}
function verifyModel(model) {
  for (const edge of Object.values(model.connections)) {
    const points = [edge.from, ...edge.via, edge.to].map(ref => point(model, ref));
    for (const p of points) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), edge.id);
      assert.equal(p.medium, points[0].medium, edge.id);
    }
  }
}
function slotMarkup(svg, i) {
  const start = svg.indexOf(`<g data-distributor-slot="${i}"`);
  assert.ok(start >= 0, `Missing slot ${i}`);
  const tags = /<\/?g\b[^>]*>/g; tags.lastIndex = start;
  let depth = 0, match;
  while ((match = tags.exec(svg))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) return svg.slice(start, tags.lastIndex);
  }
  assert.fail('Unclosed slot group');
}

for (let count = 1; count <= 6; count++) {
  test(`${count} slots render without entities, in YAML order, without truncation`, () => {
    const slots = Array.from({ length: count }, (_, i) => ({ name: `Slot-${i}`, typ: i % 2 ? 'fussboden' : 'heizkoerper' }));
    const card = create(slots), model = card._model, svg = card._render();
    verifyModel(model);
    assert.equal(Object.keys(model.components).filter(id => id.startsWith('distributor-slot-')).length, count);
    let previousX = -Infinity, previousIndex = -1;
    for (let i = 0; i < count; i++) {
      const component = model.components[`distributor-slot-${i}`];
      assert.ok(component.origin.x > previousX); previousX = component.origin.x;
      const at = svg.indexOf(`<g data-distributor-slot="${i}"`);
      assert.ok(at > previousIndex); previousIndex = at;
      assert.ok(slotMarkup(svg, i).includes(`>Slot-${i}</text>`));
      const degree = Object.values(model.connections).reduce((n, e) => n + Number(e.from === `manifold-supply-${i}`) + Number(e.to === `manifold-supply-${i}`) + 2 * e.via.filter(v => v === `manifold-supply-${i}`).length, 0);
      assert.equal(degree, 3);
    }
    assert.ok(!/NaN|Infinity|undefined/.test(svg));
  });

  test(`${count} slots: every up/down combination has correct endpoints and crossing bridges`, () => {
    for (let mask = 0; mask < 2 ** count; mask++) {
      const slots = Array.from({ length: count }, (_, i) => ({ richtung: mask & (1 << i) ? 'oben' : 'unten', pumpe: 'switch.pump' }));
      const card = create(slots), model = card._model, svg = card._render(); verifyModel(model);
      for (let i = 0; i < count; i++) {
        const up = slots[i].richtung === 'oben', p = point(model, `distributor-slot-${i}.supply`), rail = point(model, `manifold-supply-${i}`);
        assert.equal(p.y < rail.y, up);
        assert.equal(p.direction, up ? 'bottom' : 'top');
        const pump = model.components[`distributor-pump-${i}`];
        assert.equal(pump.ports.out.y < pump.ports.in.y, up);
        const group = slotMarkup(svg, i);
        assert.match(group, /A13 13/);
        assert.match(group, /class="w3"/);
        // Every visible pipe layer and overlay must use the same geometry.
        const paths = [...group.matchAll(/<path d="([^"]+)" class="w([0123])"/g)];
        for (let j = 0; j < paths.length; j += 4) {
          assert.deepEqual(paths.slice(j, j + 4).map(m => m[2]), ['0', '1', '2', '3']);
          assert.equal(new Set(paths.slice(j, j + 4).map(m => m[1])).size, 1);
        }
      }
    }
  });
}

test('HK – FBH – Blind example: top branches, two consumers, one closed slot', () => {
  const card = create(example.verteiler.anschluesse, { speicher: example.speicher }), svg = card._render();
  assert.deepEqual(plain(card._cfg.verteiler.anschluesse.map(s => s.name)), ['HK', 'FBH', 'Blind']);
  assert.ok(slotMarkup(svg, 0).includes('data-symboltyp="heizkoerper"'));
  assert.ok(slotMarkup(svg, 1).includes('data-symboltyp="fussboden"'));
  const blind = slotMarkup(svg, 2);
  assert.equal((blind.match(/data-blank-cap/g) || []).length, 2);
  assert.ok(!blind.includes('data-symboltyp'));
  assert.ok(!blind.includes('class="w3"'));
  assert.ok(blind.includes('Blind · verschlossen'));
  assert.equal(card._model.components['distributor-slot-2'].kind, 'blank');
  assert.equal(card._model.components['distributor-slot-2'].ports.supply.closed, true);
});

test('blind slots ignore live entity values and never acquire a pump or consumer', () => {
  for (const richtung of ['oben', 'unten']) {
    const card = create([{ name: 'Reserve', status: 'blind', richtung, pumpe: 'switch.pump', vorlauf: 'sensor.vl', wmz: 'sensor.wmz' }]);
    const before = card._render();
    assert.ok(!card._model.components['distributor-pump-0']);
    assert.ok(!slotMarkup(before, 0).includes('data-more'));
    assert.ok(!slotMarkup(before, 0).includes('class="w3"'));
    card._hass.states['switch.pump'].state = 'off'; card._hass.states['sensor.vl'].state = '99';
    assert.equal(card._render(), before);
    verifyModel(card._model);
  }
});

test('list length is the count: 8 and 12 slots are not silently limited to six', () => {
  for (const count of [8, 12]) {
    const card = create(Array.from({ length: count }, (_, i) => ({ label: `Port ${i}`, status: i % 3 ? 'aktiv' : 'blind' })));
    assert.equal(card._cfg.verteiler.anschluesse.length, count);
    assert.ok(slotMarkup(card._render(), count - 1).includes(`Port ${count - 1}`));
    verifyModel(card._model);
  }
});

test('types, label alias, symbol override, custom icon and escaping', () => {
  const card = create([
    { label: 'WW & <Test>', typ: 'warmwasser' }, { typ: 'frei', symboltyp: 'fussboden' },
    { typ: 'heizkoerper', icon: 'mdi:radiator' }, { symboltyp: 'kein' },
  ]), svg = card._render();
  assert.ok(slotMarkup(svg, 0).includes('WW &amp; &lt;Test&gt;'));
  assert.ok(slotMarkup(svg, 0).includes('data-symboltyp="warmwasser"'));
  assert.ok(slotMarkup(svg, 1).includes('data-symboltyp="fussboden"'));
  assert.ok(slotMarkup(svg, 2).includes('icon="mdi:radiator"'));
  assert.ok(slotMarkup(svg, 3).includes('data-symboltyp="kein"></g>'));
  assert.equal(card._model.components['distributor-slot-0'].ports.supply.medium, 'heating-water');
});

test('wide distributor names retain their full text for measured fitting', () => {
  const name = 'W'.repeat(17);
  for (const richtung of ['oben', 'unten']) for (const status of ['aktiv', 'blind']) {
    const card = create([{ name, richtung, status }, { name, richtung, status }]);
    const svg = card._render();
    for (const i of [0, 1]) {
      const group = slotMarkup(svg, i);
      assert.ok(group.includes(`<title>${name} ·`), 'full name remains available');
      const label = group.match(new RegExp(`<text[^>]*>${name}</text>`))?.[0];
      assert.ok(label, 'full name is rendered');
      assert.ok(!label.includes('textLength'), 'rendering must not guess width from character count');
    }
    const spacing = card._model.components['distributor-slot-1'].origin.x - card._model.components['distributor-slot-0'].origin.x;
    assert.ok(spacing > 94, 'bounded labels leave a gap between adjacent slots');
  }
  assert.ok(!slotMarkup(create([{ name: 'HK' }])._render(), 0).match(/<text[^>]*textLength[^>]*>HK<\/text>/), 'short names retain their natural width');
});

test('measured fitting shrinks wide text but never stretches narrow text or retains an old fit', () => {
  const card = create([{ name: 'Anschluss 2' }]);
  const labels = [59, 170, 45, 94].map(width => ({
    width, attributes: {},
    removeAttribute(name) { delete this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getComputedTextLength() { return this.attributes.textLength ? Number(this.attributes.textLength) : this.width; },
  }));
  card.isConnected = true;
  card._textResizeObserver = {}; // Layout observation is exercised in the browser harness.
  card._box = { querySelectorAll: () => labels };
  card._fitDistributorText();
  assert.deepEqual(labels.map(label => label.attributes), [{}, { textLength: '94', lengthAdjust: 'spacingAndGlyphs' }, {}, {}]);
  card._fitDistributorText();
  assert.equal(labels[1].attributes.textLength, '94', 'repeat fitting measures natural width');
  labels[1].width = 59;
  labels[0].width = 170;
  card._fitDistributorText();
  assert.deepEqual(labels[1].attributes, {}, 'wide-to-narrow update removes compression');
  assert.equal(labels[0].attributes.textLength, '94', 'narrow-to-wide update is constrained');
});

test('temperature, energy, more-info and pump states are instance-specific', () => {
  const slots = [{ pumpe: 'switch.pump', vorlauf: 'sensor.vl', ruecklauf: 'sensor.rl', wmz: 'sensor.wmz' }];
  const a = create(slots), b = create(slots), model = a._model, bBefore = b._render();
  const on = slotMarkup(a._render(), 0);
  for (const text of ['VL 52.0°', 'RL 38.0°', '123.4 kWh', 'data-more="switch.pump"', 'class="w3"']) assert.ok(on.includes(text), text);
  a._hass.states['switch.pump'].state = 'off'; a._hass.states['sensor.wmz'].state = 'unavailable';
  const off = slotMarkup(a._render(), 0);
  assert.ok(!off.includes('class="w3"')); assert.ok(off.includes('– kWh'));
  assert.equal(a._model, model); assert.equal(b._render(), bBefore);
  assert.ok(a._ents.includes('sensor.rl'));
});

test('all inherited equipment scenarios can use the new distributor without dangling ports', () => {
  for (const scenario of scenarios()) {
    const config = { ...scenario.config }; delete config.heizkreise;
    const card = create(example.verteiler.anschluesse, config); card._hass = { states: scenario.states, language: scenario.language };
    verifyModel(card._model);
    assert.ok(card._render().includes('data-distributor-slot="2"'), scenario.name);
    assert.ok(!card._model.routingScope.fm, 'Not a free-router layout');
  }
});

test('reordering and reconfiguration replace the slot model without changing the input', () => {
  const input = structuredClone(example), before = structuredClone(input), card = new Card(); card.setConfig(input);
  const first = card._model; assert.deepEqual(input, before);
  card.setConfig({ verteiler: { anschluesse: [...input.verteiler.anschluesse].reverse() } });
  assert.notEqual(card._model, first); assert.equal(card._cfg.verteiler.anschluesse[0].name, 'Blind');
  card.setConfig({ heizkreise: [{ name: 'Legacy', pumpe: 'switch.pump' }] });
  assert.ok(card._model.components['heating-circuit-0']); assert.ok(!card._model.components['distributor-slot-0']);
});

test('invalid distributor configurations fail clearly instead of losing slots', () => {
  const invalid = [null, true, [], {}, { anschluesse: [] }, { anschluesse: [null] }, { anschluesse: ['blind'] },
    ...[{ status: 'an' }, { richtung: 'links' }, { typ: 'unknown' }, { name: 3 }, { pumpe: 'yes' }, { icon: '<script>' }, { symboltyp: 'wrong' }, { mischer: 'sensor.mix' }].map(slot => ({ anschluesse: [slot] }))];
  for (const verteiler of invalid) assert.throws(() => new Card().setConfig({ verteiler }), /verteiler/);
  assert.throws(() => create([{}], { heizkreise: [{ name: 'Legacy' }] }), /Entweder verteiler oder heizkreise/);
});

test('editor serialization preserves the YAML distributor and hides conflicting legacy list', () => {
  const Editor = registry.get('warmwasser-schema-card-editor'), editor = new Editor(); editor._build = () => {};
  editor.setConfig(example); editor._fire();
  assert.deepEqual(plain(editor.lastEvent.detail.config.verteiler), example.verteiler);
  assert.ok(!editor._listen().some(list => list.key === 'heizkreise'));
  editor.setConfig({ heizkreise: [] });
  assert.ok(editor._listen().some(list => list.key === 'heizkreise'));
});

test('current hass values drive flow without moving slots or changing cached geometry', () => {
  const card = create([{ pumpe: 'sensor.demo_pump', vorlauf: 'sensor.demo_vl', wmz: 'sensor.demo_energy' }]);
  const geometry = JSON.stringify(card._model);
  for (const [value, running] of [['on', true], ['0.5', true], ['0', false], ['-1', false], ['off', false], ['unavailable', false], ['unknown', false]]) {
    card._hass = { language: 'en', states: {
      'sensor.demo_pump': sensor(value), 'sensor.demo_vl': sensor('unavailable'),
      'sensor.demo_energy': { state: '2.5', attributes: { unit_of_measurement: 'MWh' } },
    } };
    const group = slotMarkup(card._render(), 0);
    assert.equal(group.includes('class="w3"'), running, value);
    assert.ok(group.includes('VL –')); assert.ok(group.includes('2.5 MWh'));
    assert.equal(JSON.stringify(card._model), geometry);
  }
  card._hass = { language: 'en', states: {} };
  const group = slotMarkup(card._render(), 0);
  assert.ok(!group.includes('class="w3"')); assert.ok(group.includes('– kWh'));
});

test('rails animate only to the leftmost running consumer, ignoring blind pumps', () => {
  const card = create([
    { status: 'blind', pumpe: 'switch.pump' },
    { pumpe: 'sensor.demo_off' }, { pumpe: 'switch.pump' },
  ]);
  const output = card._render();
  const group = output.slice(output.indexOf('<g data-distributor="flexible">'), output.indexOf('<g data-distributor-slot="0"'));
  const from = point(card._model, 'manifold-primary-supply'), to = point(card._model, 'manifold-supply-2');
  assert.ok(group.includes(`d="M${from.x} ${from.y}H${to.x}" class="w3"`));
  assert.ok(!slotMarkup(output, 0).includes('class="w3"'));
  assert.ok(!slotMarkup(output, 1).includes('class="w3"'));
});

test('distributor tank flow follows the upstream lower-zone heat-pump state', () => {
  for (const richtung of ['oben', 'unten']) {
    const card = create([{ pumpe: 'switch.pump', richtung }], {
      wp: { betrieb: 'sensor.demo_operation', ventil: 'sensor.demo_valve' },
    });
    const geometry = JSON.stringify(card._model);
    for (const [operation, valve, pump, expected] of [
      ['off', 'heizung', 'on', true],
      ['on', 'Warmwasser', 'on', true],
      ['on', 'heizung', 'on', false],
      ['on', '35', 'on', false],
      ['off', 'heizung', 'off', false],
      ['on', 'Warmwasser', 'off', false],
    ]) {
      card._hass.states['sensor.demo_operation'] = sensor(operation);
      card._hass.states['sensor.demo_valve'] = sensor(valve);
      card._hass.states['switch.pump'] = sensor(pump);
      const svg = card._render();
      const tankFlow = /<path d="[^"]*H254A8 8 0 0 1 270 [^"]*" class="w3"/;
      assert.equal(tankFlow.test(svg), expected, `${richtung}: ${operation}/${valve}/${pump}`);
      assert.equal(JSON.stringify(card._model), geometry, 'state changes preserve model geometry');
    }
  }
});

test('blind ports have no internal connection and warm-water slots stay on the heating side', () => {
  const card = create([{ status: 'blind' }, { typ: 'warmwasser' }]);
  for (const i of [0, 1]) {
    const supply = `distributor-slot-${i}.supply`, ret = `distributor-slot-${i}.return`;
    assert.equal(point(card._model, supply).medium, 'heating-water');
    assert.equal(point(card._model, ret).medium, 'heating-water');
    assert.ok(!Object.values(card._model.connections).some(edge => [supply, ret].includes(edge.from) && [supply, ret].includes(edge.to)));
  }
  assert.equal(point(card._model, 'distributor-slot-0.return').closed, true);
});

test('normalization reports the field and rejects new mixers without affecting legacy mixers', () => {
  for (const [field, value] of [['typ', 'gas'], ['richtung', 'links'], ['status', 'on'], ['wmz', 'invalid'], ['mischer', { anzeigen: true }]]) {
    assert.throws(() => create([{ [field]: value }]), error => error.message.startsWith(`verteiler.anschluesse[0].${field}:`));
  }
  const card = new Card(); card.setConfig({ heizkreise: [{ pumpe: 'switch.demo_pump', mischer: 'sensor.demo_mix' }] });
  assert.ok(card._model.components['heating-mixer-0']);
});

test('general editor saves preserve YAML extension values and do not add HKV controls', () => {
  const input = { ...example, verteiler: { ...example.verteiler, extension: { disabled: false, empty: '', value: null, list: [] } } };
  const Editor = registry.get('warmwasser-schema-card-editor'), editor = new Editor(); editor._build = () => {};
  editor.setConfig(input); editor._config.titel = 'Demo'; editor._fire();
  assert.deepEqual(plain(editor.lastEvent.detail.config.verteiler), input.verteiler);
  assert.equal(editor.lastEvent.detail.config.type, 'custom:warmwasser-schema-card');
  assert.equal(editor._distributorSchema, undefined);
  assert.equal(editor._addDistributorSlot, undefined);
});
