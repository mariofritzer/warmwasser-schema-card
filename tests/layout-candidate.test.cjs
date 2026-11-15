const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const registry = new Map();
const context = { HTMLElement: class {}, customElements: { get: n => registry.get(n), define: (n, c) => registry.set(n, c) }, window: {}, console: { info() {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8') + '\nglobalThis.resolve = resolveLayoutCandidate; globalThis.preflight = preflightLayoutRender; globalThis.renderGeometry=(card,candidate,hass)=>{const model=card._model,old=card._hass;try{card._model=candidate.model;card._hass=hass;layoutRenderRoutes.set(card,candidate);return card._render();}finally{layoutRenderRoutes.delete(card);card._model=model;card._hass=old;}};', context);
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
  const result = resolve({ version: 2, components: { wp: { x: 1, y: 2 } }, ports: { 'fm.unproved': { mode: 'auto' } } });
  assert.equal(result.status, 'invalid');
  assert.deepEqual(Array.from(result.errors, e => e.code), ['unknown-id']);
  assert.equal(result.model, undefined);
});

test('disabled WP keeps its position while active FM is routed, then reapplies it', () => {
  const enabled = fixture({ wp: { betrieb: 'sensor.wp' } });
  const disabled = fixture({ wp: {} });
  const fm = disabled.card._model.components.fm.origin;
  const wp = enabled.card._model.components.wp.origin;
  const layout = { version: 2, components: { fm: { x: fm.x + 30, y: fm.y + 15 }, wp: { x: 360, y: 165 } } };
  assert.notDeepEqual({ x: wp.x, y: wp.y }, layout.components.wp);
  const before = JSON.stringify(layout);
  const dormant = disabled.resolve(layout);
  assert.equal(dormant.status, 'candidate', JSON.stringify(dormant.errors));
  assert.equal(dormant.model.components.fm.origin.x, fm.x + 30);
  assert.equal(dormant.model.components.wp, undefined);
  assert.deepEqual(Array.from(dormant.inactive, e => e.path), ['layout.components.wp']);
  const restored = enabled.resolve(layout);
  assert.equal(restored.status, 'candidate', JSON.stringify(restored.errors));
  assert.equal(restored.model.components.wp.origin.x, layout.components.wp.x);
  assert.equal(restored.model.components.wp.origin.y, layout.components.wp.y);
  assert.ok(Object.values(restored.routes).every(route => route.status === 'routed'));
  assert.equal(restored.inactive.length, 0);
  assert.equal(JSON.stringify(layout), before);
  const invalid = disabled.resolve({ version: 2, components: { wp: { x: 'bad', y: 1 } } });
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.errors[0].code, 'invalid-position');
  const missingFm = fixture({ fm: {} }).resolve(layout);
  assert.equal(missingFm.status, 'unsupported');
  assert.equal(missingFm.errors[0].code, 'unsupported-configuration');
});

test('unavailable entity state does not disable a configured WP', () => {
  const { raw, card } = fixture({ wp: { betrieb: 'sensor.wp' } });
  const fm = card._model.components.fm.origin, wp = card._model.components.wp.origin;
  const layout = { version: 2, components: { fm: { x: fm.x + 30, y: fm.y + 15 }, wp: { x: wp.x, y: wp.y } } };
  const result = context.resolve(raw, card._cfg, layout);
  assert.equal(result.status, 'candidate');
  assert.ok(result.model.components.wp);
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'unavailable' }, 'sensor.wp': { state: 'unavailable' } } };
  const preflight = context.preflight(raw, layout, hass);
  assert.equal(preflight.status, 'rendered-candidate', JSON.stringify(preflight.errors));
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

for (const wp of [false, true]) test(`real render preflight uses every routed FM${wp ? '/WP' : ''} path and preserves inputs`, () => {
  const extra = wp ? { wp: { betrieb: 'sensor.wp', leistung: 'sensor.power' } } : {};
  const { raw, card, resolve } = fixture(extra);
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' }, 'sensor.power': { state: '1200' } } };
  const before = JSON.stringify({ raw, config: card._cfg, model: card._model, hass });
  const { x, y } = card._model.components.fm.origin;
  const layout = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  const candidate = resolve(layout), result = context.preflight(raw, layout, hass);
  assert.equal(result.status, 'rendered-candidate', JSON.stringify(result.errors));
  for (const route of Object.values(candidate.routes)) for (const layer of ['w0', 'w1', 'w2'])
    assert.ok(result.html.includes(`<path d="${route.path}" class="${layer}"`));
  assert.equal(JSON.stringify({ raw, config: card._cfg, model: card._model, hass }), before);
});

test('preflight fails closed for invalid layout, missing state and live-label overflow', () => {
  const { raw, card } = fixture({ fm: { pumpe: 'sensor.fm', temp: 'sensor.temp' } });
  const hass = { language: 'de', states: { 'sensor.temp': { state: '1000000000' }, 'sensor.fm': { state: 'on' } } };
  const { x, y } = card._model.components.fm.origin;
  const moved = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  const result = context.preflight(raw, moved, hass);
  assert.equal(result.status, 'unsupported'); assert.equal(result.errors[0].code, 'label-overflow'); assert.equal(result.html, undefined);
  assert.equal(context.preflight(raw, { version: 1 }, hass).status, 'invalid');
  assert.equal(context.preflight(raw, moved, {}).errors[0].code, 'invalid-hass');
  assert.equal(context.preflight(raw, { version: 2 }, hass).errors[0].code, 'unmoved-candidate');
});

test('visible volume text cannot be released without connected measurement and paint proof', () => {
  for (const volume of ['W'.repeat(80),500]) {
    const {raw,card}=fixture({speicher:{typ:'schicht',volumen:volume}});
    const {x,y}=card._model.components.fm.origin;
    const moved={version:2,components:{fm:{x:x+30,y:y+15}}};
    const hass={language:'en',states:{'sensor.fm':{state:'on',attributes:{}}}};
    const result=context.preflight(raw,moved,hass);
    assert.equal(result.status,'unsupported');
    assert.equal(result.errors[0].code,'text-measurement-unavailable');
    assert.equal(result.html,undefined);
    card._hass=hass;assert.ok(card._render().includes(String(volume)),'legacy rendering remains unchanged');
  }
});
test('split tank prefixes require measurement even without volume values',()=>{
  const {raw}=fixture({speicher:{typ:'getrennt'}});
  const result=context.preflight(raw,{version:2,components:{fm:{x:400,y:29}}},{language:'en',states:{'sensor.fm':{state:'on'}}});
  assert.equal(result.status,'unsupported');assert.equal(result.errors[0].code,'text-measurement-unavailable');assert.equal(result.html,undefined);
});

for (const thrown of [null, 'render error']) test(`preflight contains non-Error renderer throw ${JSON.stringify(thrown)}`, () => {
  const { raw, card } = fixture();
  const { x, y } = card._model.components.fm.origin;
  const layout = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  const before = JSON.stringify({ raw, layout, hass });
  const original = Card.prototype._render;
  try {
    Card.prototype._render = () => { throw thrown; };
    const result = context.preflight(raw, layout, hass);
    assert.equal(result.status, 'unsupported'); assert.equal(result.errors[0].code, 'render-failed');
    assert.equal(result.html, undefined);
    assert.equal(JSON.stringify({ raw, layout, hass }), before);
  } finally { Card.prototype._render = original; }
});

test('preflight rejects incomplete routed output without exposing HTML', () => {
  const { raw, card } = fixture();
  const { x, y } = card._model.components.fm.origin;
  const layout = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  const before = JSON.stringify({ raw, layout, hass });
  const original = Card.prototype._render;
  try {
    Card.prototype._render = () => '<svg>incomplete</svg>';
    const result = context.preflight(raw, layout, hass);
    assert.equal(result.status, 'unsupported'); assert.equal(result.errors[0].code, 'incomplete-routed-output');
    assert.equal(result.html, undefined);
    assert.equal(JSON.stringify({ raw, layout, hass }), before);
  } finally { Card.prototype._render = original; }
});

test('internal commit is transactional and never persists layout', () => {
  const { raw, card } = fixture();
  card._hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  card._update = () => {};
  const original = card._model, configBefore = JSON.stringify(card._cfg);
  const { x, y } = original.components.fm.origin;
  const layout = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  assert.equal(card._commitLayoutCandidate(layout).status, 'committed-candidate');
  const committed = card._model;
  assert.equal(committed.components.fm.origin.x, x + 30);
  assert.equal(card._commitLayoutCandidate({ version: 1 }).status, 'invalid');
  assert.equal(card._model, committed);
  assert.equal(JSON.stringify(card._cfg), configBefore);
  assert.equal(raw.layout, undefined);
  card._update = () => { throw new Error('DOM failed'); };
  assert.equal(card._commitLayoutCandidate(layout).errors[0].code, 'commit-failed');
  assert.equal(card._model, committed);
  card._hass = null;
  card.setConfig(raw);
  assert.equal(card._layoutCandidate, null);
  assert.equal(card._model.components.fm.origin.x, x);
});

for (const wp of [false, true]) test(`proven canonical ports support auto and manual with full FM${wp ? '/WP' : ''} batch`, () => {
  const { card, resolve } = fixture(wp ? { wp: { betrieb: 'sensor.wp' } } : {});
  const { x, y } = card._model.components.fm.origin;
  const common = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  const base = resolve(common);
  const ports = { 'fm.supply': { mode: 'manual', side: 'left' }, 'fm.return': { mode: 'auto' },
    'wp.upper-supply': { mode: 'manual', side: 'top' }, 'wp.lower-supply': { mode: 'manual', side: 'left' }, 'wp.return': { mode: 'auto' } };
  const layout = { ...common, ports }, before = JSON.stringify(layout), result = resolve(layout);
  assert.equal(result.status, 'candidate', JSON.stringify(result.errors));
  assert.deepEqual(Array.from(Object.keys(result.routes)).sort(), Array.from(Object.keys(base.routes)).sort());
  assert.equal(Object.keys(result.routes).length, wp ? 7 : 2);
  assert.equal(JSON.stringify(result.routes), JSON.stringify(base.routes));
  assert.equal(JSON.stringify(result.model), JSON.stringify(base.model));
  assert.equal(result.inactive.length, wp ? 0 : 3);
  assert.equal(JSON.stringify(layout), before);
});

test('manual port sides outside the drawn geometry fail closed, including dormant WP', () => {
  for (const extra of [{}, { wp: { betrieb: 'sensor.wp' } }]) {
    const { card, resolve } = fixture(extra);
    const { x, y } = card._model.components.fm.origin;
    for (const id of ['fm.supply', 'fm.return', 'wp.upper-supply', 'wp.lower-supply', 'wp.return']) {
      const result = resolve({ version: 2, components: { fm: { x: x + 30, y: y + 15 } }, ports: { [id]: { mode: 'manual', side: 'bottom' } } });
      assert.equal(result.status, 'invalid', id); assert.ok(result.errors.some(e => e.code === 'invalid-side')); assert.equal(result.model, undefined);
    }
  }
});

test('port contracts use the same routed preflight and leave legacy output unchanged', () => {
  const { raw, card } = fixture({ wp: { betrieb: 'sensor.wp' } });
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  card._hass = hass; const legacy = card._render(), { x, y } = card._model.components.fm.origin;
  const base = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  const portLayout = { ...base, ports: { 'fm.supply': { mode: 'manual', side: 'left' }, 'wp.return': { mode: 'manual', side: 'left' } } };
  assert.equal(context.preflight(raw, base, hass).html, context.preflight(raw, portLayout, hass).html);
  assert.equal(card._render(), legacy);
});

test('separated FM/WP alternate connector pairs render the entire seven-path batch', () => {
  const { raw, card, resolve } = fixture({ speicher: { typ: 'getrennt' }, wp: { betrieb: 'sensor.wp', ventil: 'sensor.valve' } });
  const layout = { version: 2, components: { fm: { x: -110, y: 14 } },
    ports: { 'tank.fm-supply': { mode: 'manual', side: 'left' }, 'fm.supply': { mode: 'manual', side: 'right' } } };
  const before = JSON.stringify({ raw, config: card._cfg, model: card._model, layout });
  const result = resolve(layout), hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  assert.equal(result.status, 'candidate', JSON.stringify(result.errors)); assert.equal(Object.keys(result.routes).length, 7);
  for (const [id, names, side] of [['hot-tank', ['fm-supply', 'fm-return'], 'left'], ['fm', ['supply', 'return'], 'right']]) {
    const component = result.model.components[id];
    for (const name of names) {
      const port = component.ports[name]; assert.equal(port.direction, side); assert.equal(port.effectiveSide, side);
      assert.ok(component.routingAreas.some(area => JSON.stringify(area) === JSON.stringify(port.stub)));
    }
  }
  const rendered = context.preflight(raw, layout, hass);
  assert.equal(rendered.status,'unsupported');assert.equal(rendered.errors[0].code,'text-measurement-unavailable');assert.equal(rendered.html,undefined);
  const html=context.renderGeometry(card,result,hass);
  for (const route of Object.values(result.routes)) for (const layer of ['w0','w1','w2'])
    assert.ok(html.includes(`<path d="${route.path}" class="${layer}"`));
  const [,vx,vy,vw,vh]=html.match(/viewBox="([^ ]+) ([^ ]+) ([^ ]+) ([^"]+)"/).map(Number);
  for (const route of Object.values(result.routes)) for (const p of route.points) {
    assert.ok(p.x-16>=vx && p.x+16<=vx+vw);assert.ok(p.y-16>=vy && p.y+16<=vy+vh);
  }
  assert.equal(JSON.stringify({ raw, config: card._cfg, model: card._model, layout }), before);
});

test('separated connector auto is deterministic; conflict, collisions and unsupported equipment fail closed', () => {
  const { raw, card, resolve } = fixture({ speicher: { typ: 'getrennt' }, wp: { betrieb: 'sensor.wp' } });
  const layout = { version: 2, components: { fm: { x: -110, y: 14 } },
    ports: { 'tank.fm-supply': { mode: 'auto' }, 'fm.supply': { mode: 'auto' } } };
  const a = resolve(layout), b = resolve(layout);
  assert.equal(a.status, 'candidate', JSON.stringify(a.errors)); assert.equal(JSON.stringify(a.routes), JSON.stringify(b.routes));
  assert.equal(a.model.components.fm.ports.supply.effectiveSide, 'right');
  const conflict = resolve({ ...layout, ports: { 'fm.supply': { mode: 'manual', side: 'left' }, 'fm.return': { mode: 'manual', side: 'right' } } });
  assert.equal(conflict.status, 'invalid'); assert.equal(conflict.errors[0].code, 'paired-port-side-conflict');
  const blocked = resolve({ ...layout, components: { fm: { x: 72, y: 14 } } });
  assert.equal(blocked.status, 'unsupported'); assert.equal(blocked.model, undefined);
  const unsupported = fixture({ speicher: { typ: 'getrennt' }, solar: { pumpe: 'sensor.solar' } }).resolve(layout);
  assert.equal(unsupported.status, 'unsupported');
  const sideOnly = { version: 2, ports: { 'tank.fm-supply': { mode: 'manual', side: 'left' }, 'fm.supply': { mode: 'manual', side: 'right' } } };
  const r = context.preflight(raw, sideOnly, { language: 'en', states: {} });
  assert.equal(r.status, 'unsupported'); assert.notEqual(r.errors[0].code, 'unmoved-candidate');
  assert.equal(card._model.layoutSeparatedPreview, undefined);
});

test('separated inactive WP layout survives disable and applies on re-enable', () => {
  const enabled = fixture({ speicher: { typ: 'getrennt' }, wp: { betrieb: 'sensor.wp' } });
  const disabled = fixture({ speicher: { typ: 'getrennt' }, wp: {} });
  const layout = { version: 2, components: { fm: { x: -110, y: 14 }, wp: { x: 330, y: 150 } },
    ports: { 'tank.fm-supply': { mode: 'manual', side: 'left' }, 'fm.supply': { mode: 'manual', side: 'right' },
      'wp.upper-supply': { mode: 'manual', side: 'top' } } };
  const before = JSON.stringify(layout), inactive = disabled.resolve(layout), active = enabled.resolve(layout);
  assert.equal(inactive.status, 'candidate', JSON.stringify(inactive.errors));
  assert.equal(inactive.inactive.length, 2); assert.equal(Object.keys(inactive.routes).length, 2);
  assert.equal(active.status, 'candidate', JSON.stringify(active.errors));
  assert.equal(active.model.components.wp.origin.x, 330); assert.equal(Object.keys(active.routes).length, 7);
  assert.equal(JSON.stringify(layout), before);
});

for (const [angle, dx, dy, upper] of [[90, 0, 0, 'right'], [180, 0, 100, 'left'], [270, -150, 200, 'left']]) test(`separated valve ${angle}° rotates ports, bounds and rendered symbol with seven paths`, () => {
  const { raw, card, resolve } = fixture({ speicher: { typ: 'getrennt' }, wp: { betrieb: 'sensor.wp', ventil: 'sensor.valve' } });
  const v = card._model.components.valve, before = JSON.stringify({ raw, model: card._model });
  const layout = { version: 2, components: { fm: { x: 400, y: 29 }, valve: { x: v.origin.x + dx, y: v.origin.y + dy, rotation: angle } },
    ports: { 'tank.wp-supply': { mode: 'manual', side: upper } } };
  const result = resolve(layout), rendered = context.preflight(raw, layout, { language: 'en', states: {} });
  assert.equal(result.status, 'candidate', JSON.stringify(result.errors)); assert.equal(Object.keys(result.routes).length, 7);
  assert.equal(rendered.status,'unsupported');assert.equal(rendered.errors[0].code,'text-measurement-unavailable');assert.equal(rendered.html,undefined);
  const rotated = result.model.components.valve;
  assert.equal(rotated.ports.wp.role, v.ports.wp.role); assert.equal(rotated.ports.upper.role, v.ports.upper.role);
  if (angle === 90 || angle === 270) { assert.equal(rotated.bounds.width, 28); assert.equal(rotated.bounds.height, 49); }
  assert.equal(result.model.layoutValveRotation,angle);
  const html=context.renderGeometry(card,result,{language:'en',states:{}});
  assert.ok(html.includes(`rotate(${angle} ${rotated.origin.x+34} ${rotated.origin.y+14})`));
  assert.ok(html.includes(`rotate(${-angle} ${rotated.origin.x+8} ${rotated.origin.y+14})`));
  for (const route of Object.values(result.routes)) for (const layer of ['w0','w1','w2']) assert.ok(html.includes(`<path d="${route.path}" class="${layer}"`));
  assert.equal(JSON.stringify({ raw, model: card._model }), before);
});

for (const [name, layout] of [
  ['upper tank', { components: { fm: { x: 400, y: 29 }, valve: { x: 228, y: 368.5, rotation: 180 } }, ports: { 'tank.wp-supply': { mode: 'manual', side: 'left' } } }],
  ['buffer', { components: { fm: { x: 400, y: 29 }, wp: { x: -110, y: 232 }, valve: { x: 277, y: 187, rotation: 0 } }, ports: { 'buffer.lower-supply': { mode: 'manual', side: 'left' }, 'tank.fm-supply': { mode: 'auto' }, 'fm.supply': { mode: 'auto' } } }],
  ['heat pump', { components: { fm: { x: 400, y: 29 }, wp: { x: -233, y: 254 }, valve: { x: 272, y: 376, rotation: 90 } }, ports: { 'wp.lower-supply': { mode: 'manual', side: 'right' }, 'tank.fm-supply': { mode: 'auto' }, 'fm.supply': { mode: 'auto' } } }],
]) test(`separated ${name} mirrored port group passes complete routed render`, () => {
  const { raw, card, resolve } = fixture({ speicher: { typ: 'getrennt' }, wp: { betrieb: 'sensor.wp', ventil: 'sensor.valve' } });
  const full = { version: 2, ...layout }, result = resolve(full);
  assert.equal(result.status, 'candidate', JSON.stringify(result.errors)); assert.equal(Object.keys(result.routes).length, 7);
  const rendered = context.preflight(raw, full, { language: 'en', states: {} });
  assert.equal(rendered.status,'unsupported');assert.equal(rendered.errors[0].code,'text-measurement-unavailable');assert.equal(rendered.html,undefined);
  const html=context.renderGeometry(card,result,{language:'en',states:{}});
  for (const route of Object.values(result.routes)) for (const layer of ['w0','w1','w2']) assert.ok(html.includes(`<path d="${route.path}" class="${layer}"`));
  if (name === 'heat pump') {
    const before = card._model.components.wp.ports['upper-supply'], after = result.model.components.wp.ports['upper-supply'];
    assert.equal(after.direction, 'top'); assert.equal(after.x, result.model.components.wp.bounds.width - before.x);
    assert.equal(result.model.components.wp.ports.return.direction, 'right');
  }
});

test('stored WP and valve placement survives disabled WP and tank type round trip', () => {
  const raw = { speicher: { typ: 'getrennt' }, fm: { pumpe: 'sensor.fm' }, wp: { betrieb: 'sensor.wp' },
    layout: { version: 2, components: { fm: { x: 400, y: 29 }, wp: { x: 330, y: 150 }, valve: { x: 228, y: 268.5, rotation: 90 } } } };
  const before = JSON.stringify(raw.layout), card = new Card();
  card.setConfig(raw); card.setConfig({ ...raw, wp: {} });
  assert.equal(JSON.stringify(card._cfg.layout), before);
  card.setConfig({ ...raw, wp: {}, speicher: { typ: 'schicht' } });
  assert.equal(JSON.stringify(card._cfg.layout), before);
  card.setConfig(raw); assert.equal(JSON.stringify(card._cfg.layout), before);
  const result = context.resolve(raw, card._cfg, card._cfg.layout);
  assert.equal(result.status, 'candidate', JSON.stringify(result.errors));
  assert.equal(result.model.components.wp.origin.x, 330); assert.equal(result.model.layoutValveRotation, 90);
});

for (const typ of ['schicht', 'trennblech']) test(`${typ} rejects a moved FM body overlapping the tank`, () => {
  const { resolve } = fixture({ speicher: { typ } });
  const result = resolve({ version: 2, components: { fm: { x: 115, y: -61 } } });
  assert.equal(result.status, 'unsupported'); assert.equal(result.errors[0].code, 'body-collision'); assert.equal(result.model, undefined);
});

test('separated buffer placement moves its feet and keeps the seven routed paths', () => {
  const { raw, card, resolve } = fixture({ speicher: { typ: 'getrennt' }, wp: { betrieb: 'sensor.wp' } });
  const buffer = card._model.components['buffer-tank'], feet = card._model.components['tank-feet'];
  const layout = { version: 2, components: { fm: { x: 400, y: 29 }, buffer: { x: buffer.origin.x + 5, y: buffer.origin.y } } };
  const result = resolve(layout);
  assert.equal(result.status, 'candidate', JSON.stringify(result.errors));
  assert.equal(result.model.components['buffer-tank'].origin.x, buffer.origin.x + 5);
  assert.equal(result.model.components['tank-feet'].origin.x, feet.origin.x + 5);
  assert.equal(Object.keys(result.routes).length, 7);
  const rendered = context.preflight(raw, layout, { language: 'en', states: {} });
  assert.equal(rendered.status,'unsupported');assert.equal(rendered.errors[0].code,'text-measurement-unavailable');assert.equal(rendered.html,undefined);
  const html=context.renderGeometry(card,result,{language:'en',states:{}});
  for (const route of Object.values(result.routes)) for (const layer of ['w0','w1','w2']) assert.ok(html.includes(`<path d="${route.path}" class="${layer}"`));
});
