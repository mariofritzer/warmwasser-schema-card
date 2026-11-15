const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Minimal DOM: exercise the editor's actual form/button callbacks and emitted
// events. This does not simulate Home Assistant's ha-form implementation.
class Element {
  constructor(tag = '') { this.tagName = tag; this.children = []; this.listeners = {}; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, detail) { for (const fn of this.listeners[type] || []) fn({ detail, stopPropagation() {} }); }
  set innerHTML(value) { this._html = value; this.children = []; }
  getElementById() { return this.appendChild(new Element('container')); }
}
class Host extends Element {
  attachShadow() { return this.shadowRoot = new Element('shadow'); }
  dispatchEvent(event) { (this.events ||= []).push(event); return true; }
}
class CustomEvent { constructor(type, options) { this.type = type; Object.assign(this, options); } }
const registry = new Map();
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8'), {
  HTMLElement: Host, CustomEvent, document: { createElement: tag => new Element(tag) },
  customElements: { get: name => registry.get(name), define: (name, ctor) => registry.set(name, ctor) },
  window: {}, console: { info() {} },
});
const Editor = registry.get('warmwasser-schema-card-editor');
const plain = value => JSON.parse(JSON.stringify(value));
const descendants = node => [node, ...node.children.flatMap(descendants)];
function editorFor(config) {
  const editor = new Editor();
  editor.hass = { language: 'en' };
  editor.setConfig(config);
  return editor;
}

test('main form change emits a bubbling config-changed and preserves layout and list IDs', () => {
  const layout = { version: 2, components: { 'sensor:top': { x: 42, y: 7 } }, ports: { 'fm.supply': { mode: 'auto' } } };
  const editor = editorFor({ type: 'custom:warmwasser-schema-card', sprache: 'en', layout,
    fuehler: [{ id: 'top', entity: 'sensor.top', name: 'Top' }],
    heizkreise: [{ id: 'floor', pumpe: 'switch.floor' }] });
  assert.equal(editor.events, undefined);
  editor._mainForm.emit('value-changed', { value: { titel: 'New title' } });
  assert.equal(editor.events.length, 1);
  const event = editor.events[0], config = plain(event.detail.config);
  assert.equal(event.type, 'config-changed');
  assert.equal(event.bubbles, true); assert.equal(event.composed, true);
  assert.equal(config.titel, 'New title'); assert.equal(config.sprache, 'en');
  assert.deepEqual(config.layout, layout);
  assert.equal(config.fuehler[0].id, 'top'); assert.equal(config.heizkreise[0].id, 'floor');
});

test('removing a list entry emits the remaining entry and leaves layout intact', () => {
  const layout = { version: 2, components: { 'sensor:first': { x: 10, y: 20 } } };
  const editor = editorFor({ layout, fuehler: [{ id: 'first', entity: 'sensor.first' }, { id: 'second', entity: 'sensor.second' }] });
  const removeButtons = descendants(editor.shadowRoot).filter(node => node.className === 'rm');
  assert.equal(removeButtons.length, 2);
  removeButtons[0].emit('click');
  assert.equal(editor.events.length, 1);
  const config = plain(editor.events[0].detail.config);
  assert.deepEqual(config.fuehler, [{ id: 'second', entity: 'sensor.second' }]);
  assert.deepEqual(config.layout, layout);
});

for (const layout of [{}, null, false, '', { version: 2, components: {}, extra: false }]) {
  test(`main form preserves raw layout ${JSON.stringify(layout)}`, () => {
    const editor = editorFor({ layout });
    editor._mainForm.emit('value-changed', { value: { titel: 'Updated' } });
    assert.deepEqual(plain(editor.events[0].detail.config).layout, layout);
  });
}

for (const [language, key] of [['de', 'fuehler'], ['en', 'heizkreise'], ['en', 'energie']]) {
  test(`${language} ${key} form preserves hidden fields and permits clearing visible fields`, () => {
    const editor = editorFor({ sprache: language, [key]: [{ id: 'stable', name: 'Old', entity: 'sensor.old', extra: { empty: '', flag: false } }] });
    const form = editor._forms[1];
    form.emit('value-changed', { value: { name: 'New' } });
    const item = plain(editor.events[0].detail.config)[key][0];
    assert.equal(item.id, 'stable');
    assert.equal(item.name, 'New');
    assert.deepEqual(item.extra, { empty: '', flag: false });
    if (key !== 'heizkreise') assert.equal(item.entity, undefined);
    else assert.equal(item.entity, 'sensor.old');
  });
}

for (const cleared of ['', null, false]) {
  test(`list form cleans explicitly cleared visible value ${JSON.stringify(cleared)} while preserving zero`, () => {
    const editor = editorFor({ fuehler: [{ id: 'stable', name: 'Old', entity: 'sensor.old', hoehe: 50 }] });
    editor._forms[1].emit('value-changed', { value: { name: cleared, entity: 'sensor.old', hoehe: 0 } });
    const item = plain(editor.events[0].detail.config).fuehler[0];
    assert.deepEqual(item, { id: 'stable', entity: 'sensor.old', hoehe: 0 });
  });
}

function layoutEditor(extra = {}) {
  const config = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, ...extra };
  const editor = editorFor(config);
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' }, 'sensor.temp': { state: '42' } } };
  const card = new (registry.get('warmwasser-schema-card'))(); card.setConfig(config);
  const { x, y } = card._model.components.fm.origin;
  return { editor, config, moved: (dx = 30) => ({ version: 2, components: { fm: { x: x + dx, y: y + 15 } } }) };
}

test('draft snapshots, undo/redo and branching stay isolated until valid apply', () => {
  const { editor, config, moved } = layoutEditor();
  const before = JSON.stringify(config);
  let state = editor._beginLayoutDraft();
  assert.equal(state.canUndo, false); assert.equal(state.canRedo, false);
  const a = moved(30), b = moved(40);
  state = editor._editLayoutDraft(a); assert.equal(state.status, 'rendered-candidate');
  a.components.fm.x = -999; assert.notEqual(state.layout.components.fm.x, -999);
  editor._editLayoutDraft(b);
  state = editor._undoLayoutDraft(); assert.equal(state.canRedo, true);
  assert.equal(state.layout.components.fm.x, moved(30).components.fm.x);
  state = editor._redoLayoutDraft(); assert.equal(state.layout.components.fm.x, b.components.fm.x);
  editor._undoLayoutDraft(); state = editor._editLayoutDraft(moved(35));
  assert.equal(state.canRedo, false); assert.equal(editor.events, undefined);
  assert.equal(JSON.stringify(config), before); assert.equal(editor._config.layout, undefined);
  assert.equal(editor._applyLayoutDraft().status, 'applied');
  assert.equal(editor.events.length, 1);
  assert.deepEqual(plain(editor.events[0].detail.config.layout), moved(35));
  assert.equal(editor._layoutDraftState(), null);
});

test('invalid and unsupported drafts never emit and are revalidated with current hass', () => {
  const { editor, moved } = layoutEditor({ fm: { pumpe: 'sensor.fm', temp: 'sensor.temp' } });
  editor._beginLayoutDraft();
  assert.equal(editor._editLayoutDraft({ version: 1 }).status, 'invalid');
  assert.equal(editor._applyLayoutDraft().status, 'invalid');
  assert.equal(editor.events, undefined);
  assert.equal(editor._editLayoutDraft(moved()).status, 'rendered-candidate');
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.temp': { state: '1000000000' } } };
  const result = editor._applyLayoutDraft();
  assert.equal(result.status, 'unsupported'); assert.equal(result.errors[0].code, 'label-overflow');
  assert.equal(editor.events, undefined); assert.equal(editor._config.layout, undefined);
});

test('inactive WP positions survive draft edit and apply; setConfig resets history', () => {
  const { editor, moved } = layoutEditor({ wp: {} });
  const layout = moved(); layout.components.wp = { x: 360, y: 165 };
  editor._beginLayoutDraft(); assert.equal(editor._editLayoutDraft(layout).status, 'rendered-candidate');
  assert.equal(editor._applyLayoutDraft().status, 'applied');
  assert.deepEqual(plain(editor.events[0].detail.config.layout.components.wp), { x: 360, y: 165 });
  editor._beginLayoutDraft(); editor._editLayoutDraft(moved());
  editor.setConfig(editor.events[0].detail.config);
  assert.equal(editor._layoutDraftState(), null);
});

test('valid apply tolerates synchronous Home Assistant setConfig echo', () => {
  const { editor, moved } = layoutEditor();
  editor._beginLayoutDraft(); assert.equal(editor._editLayoutDraft(moved()).status, 'rendered-candidate');
  const events = [];
  editor.dispatchEvent = event => {
    events.push(event);
    editor.setConfig(event.detail.config);
    return true;
  };
  assert.equal(editor._applyLayoutDraft().status, 'applied');
  assert.equal(events.length, 1);
  assert.deepEqual(plain(editor._config.layout), moved());
  assert.equal(editor._layoutDraftState(), null);
});

test('apply revalidates after an unrelated form enables unsupported equipment', () => {
  const { editor, moved } = layoutEditor();
  editor._beginLayoutDraft(); assert.equal(editor._editLayoutDraft(moved()).status, 'rendered-candidate');
  editor._mainForm.emit('value-changed', { value: { solar: { pumpe: 'sensor.solar' } } });
  assert.equal(editor.events.length, 1); // Ordinary form change, not draft apply.
  const result = editor._applyLayoutDraft();
  assert.equal(result.status, 'unsupported');
  assert.equal(result.errors[0].code, 'unsupported-configuration');
  assert.equal(editor.events.length, 1);
  assert.equal(editor._config.layout, undefined);
  assert.equal(editor._layoutDraftState().status, 'unsupported');
});
