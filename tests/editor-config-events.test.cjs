const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Minimal DOM: exercise the editor's actual form/button callbacks and emitted
// events. This does not simulate Home Assistant's ha-form implementation.
class Element {
  constructor(tag = '') { this.tagName = tag; this.children = []; this.listeners = {}; this.style = {}; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  setAttribute(name, value) { (this.attributes ||= {})[name] = value; }
  replaceChildren(...children) { this.children = children; }
  querySelector() { return null; }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 800, height: 600 }; }
  attachShadow() { return this.shadowRoot = new Element('shadow'); }
  emit(type, detail) { for (const fn of this.listeners[type] || []) fn({ detail, target: this, stopPropagation() {}, preventDefault() {}, ...(detail || {}) }); }
  set innerHTML(value) { this._html = value; this.children = []; }
  getElementById() { return this.appendChild(new Element('container')); }
}
class Host extends Element {
  attachShadow() { return this.shadowRoot = new Element('shadow'); }
  dispatchEvent(event) { (this.events ||= []).push(event); return true; }
}
class CustomEvent { constructor(type, options) { this.type = type; Object.assign(this, options); } }
const registry = new Map();
const frames = new Map(); let nextFrame = 0;
const observers = [];
class ResizeObserverMock {
  constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
  observe(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
}
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8'), {
  HTMLElement: Host, CustomEvent, ResizeObserver: ResizeObserverMock, document: { createElement: tag => new Element(tag) },
  customElements: { get: name => registry.get(name), define: (name, ctor) => registry.set(name, ctor) },
  window: {}, console: { info() {} },
  requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; },
  cancelAnimationFrame: id => frames.delete(id),
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

test('visual editor remains absent behind its default gate', () => {
  const { editor } = layoutEditor();
  assert.equal(editor._layoutPanel, null);
  assert.equal(descendants(editor.shadowRoot).some(node => node.className === 'layout-editor'), false);
});

test('guarded visual editor previews, edits, undoes and applies via real callbacks', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  const config = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, wp: { betrieb: 'sensor.wp' } };
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  editor.setConfig(config);
  const ui = editor._layoutPanel;
  assert.ok(ui); assert.ok(ui.previewRoot._html.includes('<svg'));
  assert.equal(ui.select.value, 'fm'); assert.equal(ui.apply.disabled, true);
  const originalX = Number(ui.inputs.x.value), originalY = Number(ui.inputs.y.value);
  ui.inputs.x.value = String(originalX + 30); ui.inputs.x.emit('change');
  ui.inputs.y.value = String(Number(ui.inputs.y.value) + 15); ui.inputs.y.emit('change');
  assert.equal(ui.apply.disabled, false); assert.ok(ui.previewRoot._html.includes('<svg'));
  const validHtml = ui.previewRoot._html;
  assert.equal(editor.events, undefined);
  ui.undo.emit('click'); assert.equal(Number(ui.inputs.y.value), originalY);
  ui.redo.emit('click'); assert.equal(ui.previewRoot._html, validHtml);
  ui.select.value = 'wp'; ui.select.emit('change'); assert.equal(ui.select.value, 'wp');
  ui.apply.emit('click'); assert.equal(editor.events.length, 1);
  assert.equal(editor.events[0].detail.config.layout.components.fm.x, originalX + 30);
});

test('guarded visual editor keyboard and touch buttons preserve draft and block invalid apply', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui = editor._layoutPanel, original = Number(ui.inputs.x.value);
  const right = descendants(ui.panel).find(node => node.attributes?.['aria-label'] === 'Right');
  right.emit('click'); assert.equal(Number(ui.inputs.x.value), original + 1);
  // The preview host itself receives arrow input; child shadow content is not required.
  const previewHost = descendants(ui.panel).find(node => node.className === 'layout-preview');
  ui.panel.emit('keydown', { target: previewHost, key: 'ArrowRight', shiftKey: true });
  assert.equal(Number(ui.inputs.x.value), original + 11);
  ui.panel.emit('keydown', { target: previewHost, key: 'z', ctrlKey: true });
  assert.equal(Number(ui.inputs.x.value), original + 1);
  ui.inputs.x.value = '72'; ui.inputs.x.emit('change'); ui.inputs.y.value = '14'; ui.inputs.y.emit('change');
  assert.equal(ui.apply.disabled, true); assert.ok(ui.previewRoot._html.includes('<svg'));
  ui.apply.emit('click'); assert.equal(editor.events, undefined);
});

test('visual editor keeps a focused uncommitted number during hass updates', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  const states = value => ({ language: 'de', states: { 'sensor.fm': { state: value } } });
  editor.hass = states('on');
  editor.setConfig({ sprache: 'de', speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui = editor._layoutPanel, original = Number(ui.inputs.x.value);
  editor.shadowRoot.activeElement = ui.inputs.x;
  ui.inputs.x.value = String(original + 30);
  editor.hass = states('off');
  assert.equal(ui.inputs.x.value, String(original + 30));
  assert.equal(editor._layoutDraft.history.length, 1);
  ui.inputs.x.emit('change');
  assert.equal(editor._layoutDraft.history.length, 2);
  assert.equal(editor._layoutDraftState().layout.components.fm.x, original + 30);
  editor.shadowRoot.activeElement = null;
  editor._undoLayoutDraft(); editor._refreshLayoutUI();
  assert.equal(Number(ui.inputs.x.value), original);
});

test('visual refresh performs one live preflight render per valid draft', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  const state = value => ({ language: 'en', states: { 'sensor.fm': { state: value } } });
  editor.hass = state('on');
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui = editor._layoutPanel;
  ui.inputs.x.value = String(Number(ui.inputs.x.value) + 30); ui.inputs.x.emit('change');
  ui.inputs.y.value = String(Number(ui.inputs.y.value) + 15); ui.inputs.y.emit('change');
  assert.equal(ui.apply.disabled, false);
  const Card = registry.get('warmwasser-schema-card'), render = Card.prototype._render;
  let calls = 0;
  try {
    Card.prototype._render = function() { calls++; return render.call(this); };
    editor.hass = state('off');
    assert.equal(calls, 1);
    assert.ok(ui.previewRoot._html.includes('<svg'));
    assert.equal(ui.apply.disabled, false);
  } finally { Card.prototype._render = render; }
});

test('pointer drag uses inverse screen matrix, coalesces moves and cancels stale frames', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui = editor._layoutPanel, x = Number(ui.inputs.x.value), y = Number(ui.inputs.y.value);
  const svg = { getScreenCTM: () => ({ inverse: () => ({ a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 }) }),
    getAttribute: () => '0 0 800 600', setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  ui.previewRoot.querySelector = () => svg;
  ui.viewport.getBoundingClientRect = () => ({ left: 0, top: 0 }); ui.viewport.scrollLeft = 0; ui.viewport.scrollTop = 0;
  ui.overlay.setPointerCapture = () => {}; ui.overlay.releasePointerCapture = () => {};
  const pointer = (clientX, clientY) => ({ pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX, clientY });
  ui.overlay.emit('pointerdown', pointer(10, 20));
  ui.overlay.emit('pointermove', pointer(30, 40)); ui.overlay.emit('pointermove', pointer(50, 60));
  assert.equal(frames.size, 1);
  const frame = [...frames.values()][0]; frames.clear(); frame();
  assert.equal(Number(ui.inputs.x.value), x + 20); assert.equal(Number(ui.inputs.y.value), y + 20);
  ui.overlay.emit('pointermove', pointer(70, 80));
  ui.overlay.emit('pointerup', pointer(70, 80));
  assert.equal(Number(ui.inputs.x.value), x + 30); assert.equal(Number(ui.inputs.y.value), y + 30);
  assert.equal(frames.size, 0); assert.equal(editor._layoutDraft.history.length, 2);
  ui.undo.emit('click'); assert.equal(Number(ui.inputs.x.value), x);
  ui.overlay.emit('pointerdown', pointer(10, 20)); ui.overlay.emit('pointermove', pointer(50, 60));
  const cancelledFrame = [...frames.values()][0]; frames.clear(); cancelledFrame();
  assert.equal(Number(ui.inputs.x.value), x + 20);
  ui.overlay.emit('pointercancel', pointer(50, 60)); assert.equal(Number(ui.inputs.x.value), x);
  assert.equal(editor._layoutDraft.history.length, 2); // Redo branch is restored.
  ui.overlay.emit('pointerdown', pointer(10, 20)); ui.overlay.emit('pointermove', pointer(50, 60));
  const stale = [...frames.values()][0];
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  stale(); assert.equal(editor._layoutDraft.history.length, 1);
});

test('rebuild and disconnect cancel a drag and reject old animation frames', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const armDrag = () => {
    const ui = editor._layoutPanel;
    const svg = { getScreenCTM: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
      getAttribute: () => '0 0 800 600', setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    ui.previewRoot.querySelector = () => svg; ui.viewport.scrollLeft = ui.viewport.scrollTop = 0;
    ui.overlay.setPointerCapture = () => {}; ui.overlay.releasePointerCapture = () => {};
    const event = { pointerId: 7, isPrimary: true, pointerType: 'mouse', button: 0, clientX: 20, clientY: 20 };
    ui.overlay.emit('pointerdown', event); ui.overlay.emit('pointermove', { ...event, clientX: 50 });
    return { ui, stale: [...frames.values()][0] };
  };
  const original = Number(editor._layoutPanel.inputs.x.value);
  const first = armDrag(), oldObserver = editor._layoutResizeObserver;
  editor._build(); assert.equal(oldObserver.disconnected, true); assert.equal(editor._layoutDrag, null);
  first.stale(); assert.equal(Number(editor._layoutPanel.inputs.x.value), original);
  assert.equal(editor._layoutDraft.history.length, 1);
  const second = armDrag(), secondObserver = editor._layoutResizeObserver;
  editor.disconnectedCallback(); assert.equal(secondObserver.disconnected, true); assert.equal(editor._layoutDrag, null);
  second.stale(); assert.equal(Number(editor._layoutPanel.inputs.x.value), original);
  assert.equal(editor._layoutDraft.history.length, 1);
  editor.connectedCallback(); assert.notEqual(editor._layoutResizeObserver, secondObserver);
});

test('resize repositions overlay and cancels active drag with stale transform', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui = editor._layoutPanel, observer = editor._layoutResizeObserver;
  let width = 400;
  const svg = { getScreenCTM: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    getAttribute: () => '0 0 800 600', setAttribute() {}, getBoundingClientRect: () => ({ left: 10, top: 20, width, height: 300 }) };
  ui.previewRoot.querySelector = () => svg; ui.viewport.scrollLeft = ui.viewport.scrollTop = 0;
  ui.overlay.setPointerCapture = () => {}; ui.overlay.releasePointerCapture = () => {};
  const event = { pointerId: 8, isPrimary: true, pointerType: 'touch', clientX: 10, clientY: 20 };
  ui.overlay.emit('pointerdown', event); ui.overlay.emit('pointermove', { ...event, clientX: 40 });
  const stale = [...frames.values()][0];
  width = 250; ui.viewport.rect = { left: 0, top: 0, width: 500, height: 400 };
  observer.callback(); assert.equal(editor._layoutDrag, null); assert.equal(ui.overlay.style.width, '250px');
  stale(); assert.equal(editor._layoutDraft.history.length, 1);
});
