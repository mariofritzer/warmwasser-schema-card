const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real update method with a minimal DOM commit surface.
const registry = new Map();
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8'), {
  HTMLElement: class {},
  document: { createElement: () => ({ content: {}, set innerHTML(value) { this.content.html = value; } }) },
  customElements: { get: name => registry.get(name), define: (name, ctor) => registry.set(name, ctor) },
  window: {}, console: { info() {} },
});
const Card = registry.get('warmwasser-schema-card');
function cardWithCommit() {
  const card = new Card();
  card._init = () => { card._box = { get innerHTML() { return this.html || ''; }, set innerHTML(value) { this.html = value; }, replaceChildren(content) { this.html = content.html; } }; };
  return card;
}

test('a failed initial render retries with the same state', () => {
  const card = cardWithCommit(); let calls = 0;
  card._render = () => { if (++calls === 1) throw new Error('render failed'); return 'rendered'; };
  card.setConfig({});
  const hass = { language: 'en', states: {} };
  assert.throws(() => { card.hass = hass; }, /render failed/);
  card.hass = hass;
  assert.equal(calls, 2); assert.equal(card._box.html, 'rendered');
  card.hass = hass; assert.equal(calls, 2);
});

test('a failed DOM commit retries with the same state', () => {
  const card = cardWithCommit(); let calls = 0;
  card._render = () => 'rendered';
  card._init = () => { card._box = { replaceChildren() { if (++calls === 1) throw new Error('commit failed'); } }; };
  card.setConfig({}); const hass = { language: 'en', states: {} };
  assert.throws(() => { card.hass = hass; }, /commit failed/);
  card.hass = hass; assert.equal(calls, 2);
});

test('late setConfig renders and language or configuration changes cause updates', () => {
  const card = cardWithCommit(); let calls = 0;
  card._render = () => String(++calls);
  card.hass = { language: 'en', states: {} }; assert.equal(calls, 0);
  card.setConfig({ titel: 'First' }); assert.equal(card._box.html, '1');
  card.hass = { language: 'de', states: {} }; assert.equal(card._box.html, '2');
  card.setConfig({ titel: 'Second' }); assert.equal(card._box.html, '3');
});

test('only top-level layout is excluded from entity collection and update keys', () => {
  const card = cardWithCommit(); let calls = 0;
  card._render = () => String(++calls);
  card.setConfig({ layout: { nested: ['sensor.layout_only'] }, custom: { layout: 'sensor.other', value: 'sensor.other' }, aussen: 'sensor.outside' });
  assert.deepEqual(Array.from(card._ents).sort(), ['sensor.other', 'sensor.outside']);
  card.hass = { language: 'en', states: { 'sensor.layout_only': { state: '1' }, 'sensor.other': { state: '1' }, 'sensor.outside': { state: '1' } } };
  card.hass = { language: 'en', states: { 'sensor.layout_only': { state: '2' }, 'sensor.other': { state: '1' }, 'sensor.outside': { state: '1' } } };
  assert.equal(calls, 1);
  card.hass = { language: 'en', states: { 'sensor.layout_only': { state: '2' }, 'sensor.other': { state: '2' }, 'sensor.outside': { state: '1' } } };
  assert.equal(calls, 2);
});

test('a unit-only HA update rerenders the actual heating label', () => {
  const card=cardWithCommit();
  card.setConfig({speicher:{typ:'schicht'},heizkreise:[{wmz:'sensor.energy'}]});
  const hass=unit=>({language:'en',states:{'sensor.energy':{state:'1',attributes:{unit_of_measurement:unit}}}});
  card.hass=hass('kWh'); assert.ok(card._box.html.includes('1 kWh'));
  card.hass=hass('MWh'); assert.ok(card._box.html.includes('1 MWh'));
});

test('a newly present empty state rerenders the actual SG label', () => {
  const card=cardWithCommit();
  card.setConfig({speicher:{typ:'schicht'},wp:{betrieb:'switch.wp',sg_ready:'sensor.sg'}});
  card.hass={language:'en',states:{'switch.wp':{state:'on',attributes:{}}}};
  assert.ok(card._box.html.includes('SG unknown</text>'));
  card.hass={language:'en',states:{'switch.wp':{state:'on',attributes:{}},'sensor.sg':{state:'',attributes:{}}}};
  assert.ok(card._box.html.includes('SG </text>'));
  assert.ok(!card._box.html.includes('SG unknown</text>'));
});

test('different entity tuples cannot collide through separators', () => {
  const card=cardWithCommit();let calls=0;card._render=()=>String(++calls);
  card.setConfig({custom:{a:'sensor.one',b:'sensor.two'}});
  const hass=(a,b)=>({language:'en',states:{'sensor.one':{state:a},'sensor.two':{state:b}}});
  card.hass=hass('a|b','c');card.hass=hass('a','b|c');assert.equal(calls,2);
});

test('a committed layout falls back as a whole when a live label overflows', () => {
  const card = cardWithCommit();
  card.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm', temp: 'sensor.temp' } });
  card.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.temp': { state: '42' } } };
  const { x, y } = card._model.components.fm.origin;
  const layout = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  assert.equal(card._commitLayoutCandidate(layout).status, 'committed-candidate');
  assert.equal(card._model.components.fm.origin.x, x + 30);
  card.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.temp': { state: '1000000000' } } };
  assert.equal(card._layoutCandidate, null);
  assert.equal(card._model.components.fm.origin.x, x);
  assert.ok(card._box.html.includes('<svg'));
});


test('failed candidate commit restores DOM and retries the old model', () => {
  const card = cardWithCommit();
  card.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  card.hass = hass;
  const oldModel = card._model, oldHtml = card._box.html;
  const { x, y } = oldModel.components.fm.origin;
  const layout = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  card._fitDistributorText = () => { throw new Error('measurement error'); };
  assert.equal(card._commitLayoutCandidate(layout).errors[0].code, 'commit-failed');
  assert.equal(card._model, oldModel);
  assert.equal(card._box.html, oldHtml);
  assert.equal(card._key, null);
  let retried = false;
  card._fitDistributorText = () => { retried = true; };
  card.hass = hass;
  assert.equal(retried, true);
  assert.equal(card._box.html, oldHtml);
});

for (const withWp of [false, true]) test(`guarded saved FM${withWp ? '/WP' : ''} layout applies and reloads without changing config`, () => {
  const card = cardWithCommit(); card._layoutFeatureEnabled = () => true;
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, ...(withWp ? { wp: { betrieb: 'sensor.wp' } } : {}) };
  card.setConfig(raw);
  const base = card._model.components.fm.origin;
  const layout = { version: 2, components: { fm: { x: base.x + 30, y: base.y + 15 }, ...(withWp ? { wp: { x: 360, y: 165 } } : {}) } };
  raw.layout = layout;
  const rawBefore = JSON.stringify(raw);
  card.setConfig(raw);
  assert.equal(card._layoutCandidate, null); // No hass yet.
  layout.components.fm.x = -9999; // Caller mutation must not affect the snapshot.
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  card.hass = hass;
  assert.equal(card._layoutStatus.status, 'rendered-candidate', JSON.stringify(card._layoutStatus));
  assert.equal(card._model.components.fm.origin.x, base.x + 30);
  if (withWp) assert.equal(card._model.components.wp.origin.x, 360);
  assert.equal(JSON.stringify(card._cfg.layout), JSON.stringify(JSON.parse(rawBefore).layout));
  const reload = cardWithCommit(); reload._layoutFeatureEnabled = () => true;
  reload.setConfig(JSON.parse(rawBefore)); reload.hass = hass;
  assert.equal(reload._model.components.fm.origin.x, base.x + 30);
  assert.equal(reload._box.html, card._box.html);
});

test('guarded saved inactive WP placement survives disable and is restored when enabled', () => {
  const card = cardWithCommit(); card._layoutFeatureEnabled = () => true;
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, wp: { betrieb: 'sensor.wp' } };
  card.setConfig(raw);
  const fm = card._model.components.fm.origin;
  raw.layout = { version: 2, components: { fm: { x: fm.x + 30, y: fm.y + 15 }, wp: { x: 360, y: 165 } } };
  const saved = JSON.stringify(raw.layout);
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  card.setConfig({ ...raw, wp: {} }); card.hass = hass;
  assert.equal(card._layoutStatus.status, 'rendered-candidate');
  assert.equal(card._model.components.wp, undefined);
  assert.equal(JSON.stringify(raw.layout), saved);
  card.setConfig(raw);
  assert.equal(card._model.components.wp.origin.x, 360);
  assert.equal(JSON.stringify(card._cfg.layout), saved);
});

test('guarded layout fails to canonical output and recovers on live state changes', () => {
  const card = cardWithCommit(); card._layoutFeatureEnabled = () => true;
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm', temp: 'sensor.temp' } };
  card.setConfig(raw); const { x, y } = card._model.components.fm.origin;
  raw.layout = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  card.setConfig(raw);
  const state = value => ({ language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.temp': { state: value } } });
  card.hass = state('42'); assert.equal(card._model.components.fm.origin.x, x + 30);
  card.hass = state('1000000000'); assert.equal(card._model.components.fm.origin.x, x);
  assert.equal(card._layoutStatus.errors[0].code, 'label-overflow');
  const canonical = cardWithCommit(); const { layout: _saved, ...plain } = raw; canonical.setConfig(plain); canonical.hass = state('1000000000');
  assert.ok(card._box.html.startsWith(canonical._box.html));
  assert.match(card._box.html, /role="status".*current sensor value.*standard diagram/);
  card.hass = state('42'); assert.equal(card._model.components.fm.origin.x, x + 30);
  assert.doesNotMatch(card._box.html, /role="status"/);
  card.setConfig({ ...raw, layout: { version: 1 } });
  assert.equal(card._layoutStatus.status, 'invalid'); assert.equal(card._model.components.fm.origin.x, x);
});

test('default gate keeps saved layout inert and preserves canonical output', () => {
  const a = cardWithCommit(), b = cardWithCommit();
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } };
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  a.setConfig(raw); const { x, y } = a._model.components.fm.origin;
  b.setConfig({ ...raw, layout: { version: 2, components: { fm: { x: x + 30, y: y + 15 } } } });
  a.hass = hass; b.hass = hass;
  assert.ok(b._box.html.startsWith(a._box.html)); assert.match(b._box.html, /role="status".*layout feature is currently disabled/);
  assert.equal(b._model.components.fm.origin.x, x);
});

test('unsupported stored configuration renders the exact canonical diagram', () => {
  const card = cardWithCommit(); card._layoutFeatureEnabled = () => true;
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, solar: { pumpe: 'sensor.solar' }, layout: { version: 2, components: { fm: { x: 300, y: 200 } } } };
  const hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.solar': { state: 'off' } } };
  card.setConfig(raw); card.hass = hass;
  const canonical = cardWithCommit(); const { layout, ...plain } = raw; canonical.setConfig(plain); canonical.hass = hass;
  assert.equal(card._layoutStatus.errors[0].code, 'unsupported-configuration');
  assert.ok(card._box.html.startsWith(canonical._box.html));
  assert.match(card._box.html, /role="status".*cannot currently be displayed safely/);
});

test('guarded live update restores DOM and model on post-render failure', () => {
  const card = cardWithCommit(); card._layoutFeatureEnabled = () => true;
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm', temp: 'sensor.temp' } };
  card.setConfig(raw); const { x, y } = card._model.components.fm.origin;
  raw.layout = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  card.setConfig(raw);
  const state = value => ({ language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.temp': { state: value } } });
  card.hass = state('42'); const oldHtml = card._box.html, oldModel = card._model;
  card._fitDistributorText = () => { throw new Error('measurement error'); };
  assert.throws(() => { card.hass = state('1000000000'); }, /measurement error/);
  assert.equal(card._box.html, oldHtml); assert.equal(card._model, oldModel); assert.equal(card._key, null);
  card._fitDistributorText = () => {};
  card.hass = state('1000000000'); assert.equal(card._model.components.fm.origin.x, x);
});

test('guarded explicit draft takes precedence over saved layout until setConfig', () => {
  const card = cardWithCommit(); card._layoutFeatureEnabled = () => true;
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } };
  card.setConfig(raw); const { x, y } = card._model.components.fm.origin;
  raw.layout = { version: 2, components: { fm: { x: x + 30, y: y + 15 } } };
  const saved = JSON.stringify(raw.layout);
  const state = value => ({ language: 'en', states: { 'sensor.fm': { state: value } } });
  card.setConfig(raw); card.hass = state('on');
  // Even a draft equal to the saved value is freshly resolved by _update.
  assert.equal(card._commitLayoutCandidate(raw.layout).status, 'committed-candidate');
  const draft = { version: 2, components: { fm: { x: x + 40, y: y + 20 } } };
  assert.equal(card._commitLayoutCandidate(draft).status, 'committed-candidate');
  assert.equal(card._model.components.fm.origin.x, x + 40);
  draft.components.fm.x = -999;
  card.hass = state('off'); assert.equal(card._model.components.fm.origin.x, x + 40);
  assert.equal(JSON.stringify(raw.layout), saved);
  card.setConfig(raw); assert.equal(card._model.components.fm.origin.x, x + 30);
  assert.equal(card._layoutDraft, null);
});

for (const [language, message] of [['de', /Layout-Version wird nicht unterstützt/], ['en', /layout version is not supported/]]) test(`${language} saved invalid layout reports failure and keeps standard output`, () => {
  const card = cardWithCommit(); card._layoutFeatureEnabled = () => true;
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, layout: { version: 1 } };
  card.setConfig(raw); card.hass = { language, states: { 'sensor.fm': { state: 'on' } } };
  assert.match(card._box.html, message); assert.match(card._box.html, /role="status" aria-live="polite"/);
  const standard = cardWithCommit(); const { layout, ...plain } = raw; standard.setConfig(plain); standard.hass = card._hass;
  assert.ok(card._box.html.startsWith(standard._box.html));
  card.setConfig({ ...plain, layout: { version: 2, components: { fm: { x: 370, y: 29 } } } });
  assert.doesNotMatch(card._box.html, /role="status"/);
});
