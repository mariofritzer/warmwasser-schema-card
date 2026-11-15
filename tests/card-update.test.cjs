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
