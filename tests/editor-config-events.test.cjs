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
const testContext = {
  HTMLElement: Host, CustomEvent, ResizeObserver: ResizeObserverMock, document: { createElement: tag => new Element(tag) },
  customElements: { get: name => registry.get(name), define: (name, ctor) => registry.set(name, ctor) },
  window: {}, console: { info() {} },
  requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; },
  cancelAnimationFrame: id => frames.delete(id),
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8') + require('./helpers/internal-layout-gate.cjs') +
  '\nglobalThis.setLayoutMeasurementJob=(owner,job)=>layoutTextMeasurementJobs.set(owner,job);', testContext);
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

test('inactive WP positions survive draft edit, apply and same-card setConfig', () => {
  const { editor, moved } = layoutEditor({ wp: {} });
  const layout = moved(); layout.components.wp = { x: 360, y: 165 };
  editor._beginLayoutDraft(); assert.equal(editor._editLayoutDraft(layout).status, 'rendered-candidate');
  assert.equal(editor._applyLayoutDraft().status, 'applied');
  assert.deepEqual(plain(editor.events[0].detail.config.layout.components.wp), { x: 360, y: 165 });
  editor._beginLayoutDraft(); editor._editLayoutDraft(moved());
  editor.setConfig(editor.events[0].detail.config);
  assert.equal(editor._layoutDraftState().status, 'unbound');
  editor.setConfig({ ...editor.events[0].detail.config, type: 'custom:other-card' });
  assert.equal(editor._layoutDraftState().status, 'unbound');
  editor._discardLayoutDraft(); assert.equal(editor._layoutDraftState().canUndo, false);
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
  assert.equal(editor._applyLayoutDraft().status, 'unbound');
  const result = editor._rebindLayoutDraft();
  assert.equal(result.status, 'unsupported');
  assert.equal(result.errors[0].code, 'unsupported-configuration');
  assert.equal(editor._applyLayoutDraft().status, 'unsupported');
  assert.equal(editor.events.length, 1);
  assert.equal(editor._config.layout, undefined);
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
  ui.previewRoot.querySelector = selector => selector === 'svg' ? svg : null;
  ui.viewport.getBoundingClientRect = () => ({ left: 0, top: 0 }); ui.viewport.scrollLeft = 0; ui.viewport.scrollTop = 0;
  ui.overlay.setPointerCapture = () => {}; ui.overlay.releasePointerCapture = () => {};
  const pointer = (clientX, clientY) => ({ pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: clientX + 2 * x, clientY: clientY + 2 * y });
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
  stale(); assert.equal(editor._layoutDraft.history.length, 2); assert.equal(editor._layoutDraft.index, 0);
});

test('mouse drag back to its start preserves the redo branch', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui = editor._layoutPanel;
  const svg = { getScreenCTM: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    getAttribute: () => '0 0 800 600', setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  ui.previewRoot.querySelector = selector => selector === 'svg' ? svg : null;
  ui.viewport.scrollLeft = ui.viewport.scrollTop = 0;
  ui.overlay.setPointerCapture = () => {}; ui.overlay.releasePointerCapture = () => {};
  const box = ui.hitBoxes.find(item => item.id === 'fm');
  const event = { pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, clientX: box.x + 10, clientY: box.y + 10 };
  ui.overlay.emit('pointerdown', event); ui.overlay.emit('pointerup', { ...event, clientX: event.clientX + 20 });
  ui.undo.emit('click');
  const history = plain(editor._layoutDraft.history);
  ui.overlay.emit('pointerdown', event); ui.overlay.emit('pointermove', { ...event, clientX: event.clientX + 10 });
  const frame = [...frames.values()][0]; frames.clear(); frame();
  ui.overlay.emit('pointerup', event);
  assert.deepEqual(plain(editor._layoutDraft.history), history);
  assert.equal(editor._layoutDraft.index, 0);
  ui.redo.emit('click'); assert.equal(editor._layoutDraft.index, 1);
});

test('mouse click and one-axis drag preserve untouched fractional coordinates', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui = editor._layoutPanel;
  const svg = { getScreenCTM: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    getAttribute: () => '0 0 800 600', setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  ui.previewRoot.querySelector = selector => selector === 'svg' ? svg : null;
  ui.viewport.scrollLeft = ui.viewport.scrollTop = 0;
  ui.overlay.setPointerCapture = () => {}; ui.overlay.releasePointerCapture = () => {};
  const box = ui.hitBoxes.find(item => item.id === 'fm');
  const x = box.originX + 0.25, y = box.originY + 0.5;
  editor._editLayoutDraft({ version: 2, components: { fm: { x, y } } }, false);
  ui.hitBoxes = [{ ...box, originX: x, originY: y }];
  const event = { pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, clientX: box.x + 10, clientY: box.y + 10 };
  const history = plain(editor._layoutDraft.history);
  ui.overlay.emit('pointerdown', event); ui.overlay.emit('pointerup', event);
  assert.deepEqual(plain(editor._layoutDraft.history), history);
  ui.hitBoxes = [{ ...box, originX: x, originY: y }];
  ui.overlay.emit('pointerdown', event); ui.overlay.emit('pointerup', { ...event, clientX: event.clientX + 10 });
  assert.equal(Number(ui.inputs.x.value), Math.round(x + 10));
  assert.equal(Number(ui.inputs.y.value), y);
});

test('rebuild and disconnect cancel a drag and reject old animation frames', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const armDrag = () => {
    const ui = editor._layoutPanel;
    const svg = { getScreenCTM: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
      getAttribute: () => '0 0 800 600', setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    ui.previewRoot.querySelector = selector => selector === 'svg' ? svg : null; ui.viewport.scrollLeft = ui.viewport.scrollTop = 0;
    ui.overlay.setPointerCapture = () => {}; ui.overlay.releasePointerCapture = () => {};
    const box = ui.hitBoxes.find(box => box.id === 'fm');
    const event = { pointerId: 7, isPrimary: true, pointerType: 'mouse', button: 0, clientX: box.x + 10, clientY: box.y + 10 };
    ui.overlay.emit('pointerdown', event); ui.overlay.emit('pointermove', { ...event, clientX: event.clientX + 30 });
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
  ui.previewRoot.querySelector = selector => selector === 'svg' ? svg : null; ui.viewport.scrollLeft = ui.viewport.scrollTop = 0;
  ui.overlay.setPointerCapture = () => {}; ui.overlay.releasePointerCapture = () => {};
  const box = ui.hitBoxes.find(box => box.id === 'fm');
  const event = { pointerId: 8, isPrimary: true, pointerType: 'touch', clientX: box.x + 10, clientY: box.y + 10 };
  ui.overlay.emit('pointerdown', event); ui.overlay.emit('pointermove', { ...event, clientX: event.clientX + 30 });
  const stale = [...frames.values()][0];
  width = 250; ui.viewport.rect = { left: 0, top: 0, width: 500, height: 400 };
  observer.callback(); assert.equal(editor._layoutDrag, null); assert.equal(ui.overlay.style.width, '250px');
  stale(); assert.equal(editor._layoutDraft.history.length, 1);
});

test('config echo and entity reorder preserve but unbind the draft until explicit rebind', () => {
  const { editor, moved } = layoutEditor();
  editor._beginLayoutDraft(); editor._editLayoutDraft(moved());
  const before = plain(editor._layoutDraftState().layout);
  const events = [];
  editor.dispatchEvent = event => { events.push(event); editor.setConfig(event.detail.config); return true; };
  editor._mainForm.emit('value-changed', { value: { titel: 'Changed' } });
  assert.equal(events.length, 1); assert.deepEqual(plain(editor._layoutDraftState().layout), before);
  assert.equal(editor._applyLayoutDraft().status, 'unbound');
  assert.equal(editor._rebindLayoutDraft().status, 'rendered-candidate');
  editor.setConfig({ ...editor._config, fuehler: [{ id: 'a', entity: 'sensor.a' }, { id: 'b', entity: 'sensor.b' }] });
  assert.equal(editor._layoutDraftState().status, 'unbound');
  editor.setConfig({ ...editor._config, fuehler: [...editor._config.fuehler].reverse() });
  assert.deepEqual(plain(editor._layoutDraftState().layout), before);
  assert.equal(editor._applyLayoutDraft().status, 'unbound'); assert.equal(events.length, 1);
  assert.equal(editor._rebindLayoutDraft().status, 'unsupported');
  editor.setConfig({ ...editor._config, fuehler: [] });
  assert.equal(editor._applyLayoutDraft().status, 'unbound');
  assert.equal(editor._rebindLayoutDraft().status, 'rendered-candidate');
  assert.equal(editor._applyLayoutDraft().status, 'applied');
  assert.equal(events.length, 2); assert.equal(editor._layoutDraftState(), null);
});

test('diagram click selects the hit component and ignores empty or ambiguous space', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, wp: { betrieb: 'sensor.wp' } });
  const ui = editor._layoutPanel;
  const svg = { getScreenCTM: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    getAttribute: () => '0 0 800 600', setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  ui.previewRoot.querySelector = selector => selector === 'svg' ? svg : null; ui.viewport.scrollLeft = ui.viewport.scrollTop = 0;
  ui.overlay.setPointerCapture = () => {}; ui.overlay.releasePointerCapture = () => {};
  const wp = ui.hitBoxes.find(box => box.id === 'wp');
  const event = { pointerId: 9, isPrimary: true, pointerType: 'mouse', button: 0, clientX: wp.x + wp.width / 2, clientY: wp.y + wp.height / 2 };
  ui.overlay.emit('pointerdown', event); ui.overlay.emit('pointerup', event);
  assert.equal(ui.select.value, 'wp'); assert.equal(editor._layoutDraft.history.length, 1);
  ui.overlay.emit('pointerdown', { ...event, clientX: -10000, clientY: -10000 });
  assert.equal(editor._layoutDrag, null); assert.equal(ui.select.value, 'wp');
  ui.hitBoxes = [{ ...wp, id: 'fm' }, wp];
  ui.overlay.emit('pointerdown', event); assert.equal(editor._layoutDrag, null);
});

test('unbound draft requires explicit confirmation in visual editor and can be discarded', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'de', states: { 'sensor.fm': { state: 'on' } } };
  const config = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } };
  editor.setConfig(config); const ui = editor._layoutPanel;
  ui.inputs.x.value = String(Number(ui.inputs.x.value) + 30); ui.inputs.x.emit('change');
  ui.inputs.y.value = String(Number(ui.inputs.y.value) + 15); ui.inputs.y.emit('change');
  assert.equal(ui.apply.disabled, false);
  editor.setConfig({ ...config, titel: 'Andere Karte' });
  assert.equal(ui.rebind.hidden, false); assert.equal(ui.apply.disabled, true);
  assert.equal(ui.inputs.x.disabled, true); assert.match(ui.status.textContent, /Konfiguration hat sich geändert/);
  ui.rebind.emit('click'); assert.equal(ui.rebind.hidden, true); assert.equal(ui.apply.disabled, false);
  editor.setConfig({ ...config, titel: 'Noch eine Karte' });
  ui.discard.emit('click'); assert.equal(ui.rebind.hidden, true); assert.equal(editor._layoutDraft.history.length, 1);
});

test('in-place nested config mutations and list reorder unbind a draft', () => {
  const editor = new Editor(); editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  const raw = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, heizkreise: [{ name: 'A' }, { name: 'B' }] };
  editor.setConfig(raw);
  const card = new (registry.get('warmwasser-schema-card'))(); card.setConfig(raw);
  const { x, y } = card._model.components.fm.origin;
  editor._beginLayoutDraft(); editor._editLayoutDraft({ version: 2, components: { fm: { x: x + 30, y: y + 15 } } });
  raw.fm.pumpe = 'sensor.other'; editor.setConfig(raw);
  assert.equal(editor._layoutDraftState().status, 'unbound');
  editor._rebindLayoutDraft();
  raw.heizkreise.reverse(); editor.setConfig(raw);
  assert.equal(editor._layoutDraftState().status, 'unbound');
  assert.equal(editor._applyLayoutDraft().status, 'unbound');
});

test('invalid layout keeps a marked draft while canonical preview remains visible', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui = editor._layoutPanel;
  const svg = { getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  ui.previewRoot.querySelector = selector => selector === 'svg' ? svg : null; ui.viewport.scrollLeft = ui.viewport.scrollTop = 0;
  ui.inputs.x.value = '72'; ui.inputs.x.emit('change'); ui.inputs.y.value = '14'; ui.inputs.y.emit('change');
  assert.equal(ui.apply.disabled, true); assert.equal(ui.marker.style.display, 'block');
  assert.equal(ui.marker.style.left, '72px'); assert.equal(ui.marker.style.top, '14px');
  assert.ok(ui.previewRoot._html.includes('<svg')); assert.match(ui.status.textContent, /overlap/);
});

test('drag rounds negative coordinates to the same whole units shown by the marker', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui=editor._layoutPanel,svg={getScreenCTM:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),
    getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
  ui.previewRoot.querySelector=selector=>selector==='svg'?svg:null;ui.viewport.scrollLeft=ui.viewport.scrollTop=0;
  const drag={id:'fm',position:{x:340,y:14},start:{x:0,y:0},pending:{x:-412.4,y:-26.6},point:(x,y)=>({x,y}),edited:false};
  editor._layoutDrag=drag;editor._paintLayoutDrag(drag);
  assert.equal(Number(ui.inputs.x.value),-72);assert.equal(Number(ui.inputs.y.value),-13);
  assert.equal(ui.marker.style.display,'block');assert.equal(ui.marker.style.left,'-72px');assert.equal(ui.marker.style.top,'-13px');
});

test('ending a drag discards the temporary measurement before refreshing the settled draft', () => {
  const editor=new Editor();editor._visualLayoutEditorEnabled=()=>true;
  editor.hass={language:'en',states:{'sensor.fm':{state:'on'}}};
  editor.setConfig({speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'}});
  let aborted=false,cleaned=false,refreshed=false;
  editor._layoutPanel.overlay.releasePointerCapture=()=>{};
  editor._layoutDrag={pointerId:4,frame:null};
  testContext.setLayoutMeasurementJob(editor,{pending:true,controller:{abort(){aborted=true;}},cleanup(){cleaned=true;},parent:editor._layoutPanel.previewRoot});
  editor._refreshLayoutUI=()=>{assert.ok(aborted && cleaned,'temporary job must be cancelled before refresh');refreshed=true;};
  editor._endLayoutDrag(false);assert.ok(refreshed);
});

test('rejected drag viewport keeps canonical viewBox and reports unsupported', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  const ui=editor._layoutPanel, writes=[];
  ui.previewRoot.querySelector=()=>({setAttribute:(name,value)=>writes.push([name,value])});
  editor._positionLayoutOverlay=()=>{};
  editor._layoutDrag={viewBox:'0 0 10 10',viewport:{x:0,y:0,width:10,height:10,viewBox:'0 0 10 10'}};
  editor._layoutDraftState=()=>({layout:{version:2,components:{}},canUndo:false,canRedo:false,status:'rendered-candidate',
    html:'<svg viewBox="0 -30 486 430"></svg>'});
  editor._refreshLayoutUI();
  assert.equal(ui.apply.disabled,true);
  assert.match(ui.status.textContent,/viewport is not supported/i);
  assert.match(ui.previewRoot._html,/<svg viewBox="0 -30 486 430"/);
  assert.deepEqual(writes,[]);
});
test('refresh preserves the connected preview for the same pending generation', () => {
  const editor=new Editor();editor._visualLayoutEditorEnabled=()=>true;
  editor.hass={language:'en',states:{'sensor.fm':{state:'on'}}};
  editor.setConfig({speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'}});
  const ui=editor._layoutPanel,viewBox='0 -30 600 500',viewport={x:0,y:-30,width:600,height:500,viewBox};
  const svg={isConnected:true,getAttribute:()=>viewBox},slot={querySelector:()=>svg};svg.parentNode=slot;
  ui.previewRoot.querySelector=selector=>selector==='[data-layout-viewport]'?slot:svg;
  editor._positionLayoutOverlay=()=>{};
  editor._layoutDraftState=()=>{throw Error('unchanged pending refresh must not render again');};
  const job={pending:true,generation:{},viewport,current:()=>true,controller:{abort(){throw Error('must remain connected');}},cleanup(){}};
  testContext.setLayoutMeasurementJob(editor,job);
  ui.previewRoot.innerHTML='connected candidate sentinel';editor._refreshLayoutUI();
  assert.equal(ui.previewRoot._html,'connected candidate sentinel');assert.equal(ui.apply.disabled,true);
});

test('reattached editor preserves dirty history but requires explicit rebind', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  const config = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } };
  editor.setConfig(config); const ui = editor._layoutPanel;
  ui.inputs.x.value = String(Number(ui.inputs.x.value) + 30); ui.inputs.x.emit('change');
  ui.inputs.y.value = String(Number(ui.inputs.y.value) + 15); ui.inputs.y.emit('change');
  const before = plain(editor._layoutDraftState().layout), length = editor._layoutDraft.history.length;
  assert.equal(ui.apply.disabled, false);
  editor.disconnectedCallback(); editor.connectedCallback();
  assert.equal(editor._layoutDraft.history.length, length);
  assert.deepEqual(plain(editor._layoutDraftState().layout), before);
  assert.equal(editor._layoutDraftState().status, 'unbound');
  assert.equal(ui.apply.disabled, true); assert.equal(ui.rebind.hidden, false);
  assert.equal(editor._applyLayoutDraft().status, 'unbound'); assert.equal(editor.events, undefined);
  ui.rebind.emit('click'); assert.equal(ui.apply.disabled, false);
  assert.equal(editor._applyLayoutDraft().status, 'applied');
});

test('external nested mutation without setConfig blocks draft apply until rebind', () => {
  const editor = new Editor(); editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.other': { state: 'on' } } };
  const config = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } };
  editor.setConfig(config);
  const card = new (registry.get('warmwasser-schema-card'))(); card.setConfig(config);
  const { x, y } = card._model.components.fm.origin;
  editor._beginLayoutDraft(); editor._editLayoutDraft({ version: 2, components: { fm: { x: x + 30, y: y + 15 } } });
  config.fm.pumpe = 'sensor.other';
  assert.equal(editor._applyLayoutDraft().status, 'unbound');
  assert.equal(editor.events, undefined);
  assert.equal(editor._rebindLayoutDraft().status, 'rendered-candidate');
  assert.equal(editor._applyLayoutDraft().status, 'applied');
  assert.equal(editor.events.length, 1);
});

test('separated editor retains connector draft while prefix text remains unproven', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'getrennt' }, fm: { pumpe: 'sensor.fm' }, wp: { betrieb: 'sensor.wp' } });
  const ui = editor._layoutPanel;
  assert.equal(ui.portControls.tank.hidden, false); assert.equal(ui.portControls.fm.hidden, false);
  assert.deepEqual(Array.from(ui.select.children, option => option.value), ['tank', 'buffer', 'fm', 'wp', 'valve']);
  ui.select.value = 'fm'; ui.select.emit('change');
  ui.inputs.x.value = '-110'; ui.inputs.x.emit('change');
  ui.portControls.tankSelect.value = 'left'; ui.portControls.tankSelect.emit('change');
  ui.portControls.fmSelect.value = 'right'; ui.portControls.fmSelect.emit('change');
  const state = editor._layoutDraftState(); assert.equal(state.status, 'unsupported', JSON.stringify(state.errors));
  assert.equal(state.layout.ports['tank.fm-supply'].side, 'left'); assert.equal(state.layout.ports['tank.fm-return'].side, 'left');
  assert.equal(state.layout.ports['fm.supply'].side, 'right'); assert.equal(state.layout.ports['fm.return'].side, 'right');
  assert.equal(ui.apply.disabled, true); assert.ok(ui.previewRoot._html.includes('<svg'));
  ui.apply.emit('click'); assert.equal((editor.events || []).length, 0);
});

test('unproven separated layout shows canonical valve geometry', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'getrennt' }, fm: { pumpe: 'sensor.fm' }, wp: { betrieb: 'sensor.wp', ventil: 'sensor.valve' },
    layout: { version: 2, components: { fm: { x: 400, y: 29 }, valve: { x: 228, y: 268.5, rotation: 90 } } } });
  const ui = editor._layoutPanel, box = ui.hitBoxes.find(b => b.id === 'valve');
  assert.equal(box.x, box.originX); assert.equal(box.y, box.originY);
  assert.equal(ui.apply.disabled,true);
});

test('editor reports saved invalid layout, then updates notice when config recovers', () => {
  const editor = editorFor({ sprache: 'de', speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, layout: { version: 1 } });
  editor.hass = { language: 'de', states: { 'sensor.fm': { state: 'on' } } };
  assert.equal(editor._layoutNotice.attributes.role, 'status');
  assert.equal(editor._layoutNotice.attributes['aria-live'], 'polite');
  assert.match(editor._layoutNotice.textContent, /Layout-Version wird nicht unterstützt/);
  editor.setConfig({ sprache: 'de', speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, layout: { version: 2, components: { fm: { x: 370, y: 29 } } } });
  assert.doesNotMatch(editor._layoutNotice.textContent, /Layout-Version/);
  assert.match(editor._layoutNotice.textContent, /Layoutfunktion ist derzeit deaktiviert/);
  editor.setConfig({ sprache: 'de', speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' } });
  assert.equal(editor._layoutNotice.hidden, true);
});

test('remove saved layout emits only that deletion, preserves opaque data and tolerates HA echo', () => {
  const raw = { type: 'custom:warmwasser-schema-card', sprache: 'en', titel: '', fm: true, trennung: false, layout: { version: 2, strange: false },
    future: { empty: '', enabled: false, values: [0, null] }, heizkreise: [{ id: 'kept', custom: false }] };
  const editor = editorFor(raw), before = plain(raw), events = [];
  editor.dispatchEvent = event => { events.push(event); editor.setConfig(event.detail.config); return true; };
  assert.equal(editor._removeLayoutButton.textContent, 'Remove saved layout');
  editor._removeLayoutButton.emit('click');
  assert.equal(events.length, 1); assert.equal(events[0].type, 'config-changed');
  assert.equal(events[0].bubbles, true); assert.equal(events[0].composed, true);
  delete before.layout;
  assert.deepEqual(plain(events[0].detail.config), before);
  assert.equal(Object.hasOwn(editor._config, 'layout'), false); assert.equal(editor._removeLayoutButton.hidden, true);
  editor._removeSavedLayout(); assert.equal(events.length, 1);
});

for (const echo of ['none', 'delayed']) test(`removing saved layout clears clean draft before ${echo} HA echo`, () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  const config = { speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, layout: { version: 2, components: { fm: { x: 370, y: 29 } } } };
  editor.setConfig(config); const ui = editor._layoutPanel;
  assert.equal(ui.apply.disabled, false);
  ui.select.value = 'fm'; editor._removeLayoutButton.emit('click');
  assert.equal(editor.events.length, 1); assert.equal(Object.hasOwn(editor.events[0].detail.config, 'layout'), false);
  assert.equal(editor._layoutDraftState().layout.components, undefined); assert.equal(ui.apply.disabled, true);
  assert.notEqual(editor._applyLayoutDraft().status, 'applied'); assert.equal(editor.events.length, 1);
  if (echo === 'delayed') {
    editor.setConfig(editor.events[0].detail.config);
    assert.equal(editor._layoutDraftState().layout.components, undefined);
    assert.equal(ui.apply.disabled, true); assert.equal(editor.events.length, 1);
  }
});

test('removing saved layout retains dirty draft unbound through delayed HA echo', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'schicht' }, fm: { pumpe: 'sensor.fm' }, layout: { version: 2, components: { fm: { x: 370, y: 29 } } } });
  const ui = editor._layoutPanel; ui.inputs.x.value = '380'; ui.inputs.x.emit('change');
  const draft = plain(editor._layoutDraftState().layout);
  editor._removeLayoutButton.emit('click');
  assert.equal(editor._layoutDraftState().status, 'unbound'); assert.deepEqual(plain(editor._layoutDraftState().layout), draft);
  editor.setConfig(editor.events[0].detail.config);
  assert.equal(editor._layoutDraftState().status, 'unbound'); assert.equal(editor._applyLayoutDraft().status, 'unbound');
  assert.deepEqual(plain(editor._layoutDraftState().layout), draft); assert.equal(editor.events.length, 1);
});

test('empty separated draft shows neutral instruction after saved-layout removal', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'de', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'getrennt' }, fm: { pumpe: 'sensor.fm' }, wp: { betrieb: 'sensor.wp' },
    layout: { version: 2, components: { fm: { x: -110, y: 14 } }, ports: { 'tank.fm-supply': { mode: 'manual', side: 'left' }, 'fm.supply': { mode: 'manual', side: 'right' } } } });
  editor._removeLayoutButton.emit('click');
  assert.match(editor._layoutPanel.status.textContent, /Komponente bewegen/);
  assert.equal(editor._layoutPanel.apply.disabled, true);
});

test('separated device picker shows named equipment and permits buffer positioning', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  editor.setConfig({ speicher: { typ: 'getrennt' }, name_fm: 'FM', name_wp: 'HP', fm: { pumpe: 'sensor.fm' }, wp: { betrieb: 'sensor.wp' },
    layout: { version: 2, components: { fm: { x: 400, y: 29 } } } });
  const ui = editor._layoutPanel, labels = Object.fromEntries(ui.select.children.map(option => [option.value, option.textContent]));
  assert.equal(labels.tank, 'Hot water tank'); assert.equal(labels.buffer, 'Buffer tank'); assert.equal(labels.wp, 'HP');
  ui.select.value = 'buffer'; ui.select.emit('change');
  const x = Number(ui.inputs.x.value); ui.inputs.x.value = String(x + 5); ui.inputs.x.emit('change');
  assert.equal(editor._layoutDraftState().layout.components.buffer.x, x + 5);
  assert.equal(editor._layoutDraftState().status, 'unsupported');
});

test('separated editor restores saved port groups and valve rotation from config', () => {
  const editor = new Editor(); editor._visualLayoutEditorEnabled = () => true;
  editor.hass = { language: 'en', states: { 'sensor.fm': { state: 'on' }, 'sensor.wp': { state: 'on' } } };
  const config = { speicher: { typ: 'getrennt' }, fm: { pumpe: 'sensor.fm' }, wp: { betrieb: 'sensor.wp' },
    layout: { version: 2, components: { fm: { x: 400, y: 29 }, wp: { x: -233, y: 254 }, valve: { x: 272, y: 376, rotation: 90 } },
      ports: { 'wp.lower-supply': { mode: 'manual', side: 'right' }, 'wp.return': { mode: 'manual', side: 'right' },
        'tank.fm-supply': { mode: 'auto' }, 'fm.supply': { mode: 'auto' } } } };
  const before = JSON.stringify(config); editor.setConfig(config); const ui = editor._layoutPanel;
  assert.equal(ui.portControls.wpSelect.value, 'right'); assert.equal(ui.portControls.tankSelect.value, 'auto');
  assert.equal(ui.portControls.fmSelect.value, 'auto'); assert.equal(ui.valveSelect.value, '90');
  ui.select.value = 'valve'; ui.select.emit('change'); assert.equal(Number(ui.inputs.x.value), 272); assert.equal(Number(ui.inputs.y.value), 376);
  assert.equal(ui.apply.disabled, true); assert.equal(JSON.stringify(config), before);
});

test('device-only hit areas leave the empty overlay available for native touch gestures',()=>{
  const editor=new Editor();editor._visualLayoutEditorEnabled=()=>true;
  editor.hass={language:'en',states:{'sensor.fm':{state:'on'}}};
  editor.setConfig({speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'}});
  const ui=editor._layoutPanel,matrix={a:1,b:0,c:0,d:1,e:0,f:0};
  const svg={getScreenCTM:()=>matrix,getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
  ui.previewRoot.querySelector=s=>s==='svg'?svg:null;ui.viewport.scrollLeft=ui.viewport.scrollTop=0;
  editor._positionLayoutOverlay();
  assert.equal(ui.handles.length,ui.hitBoxes.length);
  const fm=ui.hitBoxes.find(item=>item.id==='fm'),handle=ui.handles[ui.hitBoxes.indexOf(fm)];
  assert.equal(handle.style.left,`${fm.x}px`);assert.equal(handle.style.width,`${fm.width}px`);
  const source=fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8');
  assert.match(source,/\.layout-drag-overlay\{[^}]*pointer-events:none/);
  assert.match(source,/\.layout-device-hit\{[^}]*pointer-events:auto;touch-action:none/);
  assert.doesNotMatch(source,/\.layout-drag-overlay\{[^}]*touch-action:none/);
});

test('scroll, viewport change, a second touch and changed screen transform cancel and restore drag',()=>{
  for (const reason of ['scroll','visual-scroll','visual-resize','second-touch','matrix','finish-matrix']) {
    const editor=new Editor();editor._visualLayoutEditorEnabled=()=>true;
    editor.hass={language:'en',states:{'sensor.fm':{state:'on'}}};
    editor.setConfig({speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'}});
    const ui=editor._layoutPanel,events=()=>({handlers:{},addEventListener(n,f){this.handlers[n]=f;},removeEventListener(n,f){if(this.handlers[n]===f)delete this.handlers[n];}});
    const doc=events(),view=events();view.visualViewport=events();doc.defaultView=view;ui.viewport.ownerDocument=doc;
    let offset=0;
    const svg={getScreenCTM:()=>({inverse:()=>({a:1,b:0,c:0,d:1,e:offset,f:0})}),getAttribute:()=> '0 0 800 600',setAttribute(){},
      getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
    ui.previewRoot.querySelector=s=>s==='svg'?svg:null;ui.viewport.scrollLeft=ui.viewport.scrollTop=0;
    ui.overlay.setPointerCapture=()=>{};ui.overlay.releasePointerCapture=()=>{};
    const box=ui.hitBoxes.find(b=>b.id==='fm'),start={pointerId:1,isPrimary:true,pointerType:'touch',clientX:box.x+10,clientY:box.y+10};
    ui.overlay.emit('pointerdown',start);assert.ok(editor._layoutDrag,reason);
    ui.overlay.emit('pointermove',{...start,clientX:start.clientX+30});
    const pending=[...frames.values()][0];frames.clear();pending();
    assert.equal(Number(ui.inputs.x.value),box.originX+30,reason);
    if(reason==='scroll')doc.handlers.scroll();
    if(reason==='visual-scroll')view.visualViewport.handlers.scroll();
    if(reason==='visual-resize')view.visualViewport.handlers.resize();
    if(reason==='second-touch')doc.handlers.pointerdown({pointerId:2,pointerType:'touch'});
    if(reason==='matrix'||reason==='finish-matrix') {offset=2;ui.overlay.emit(reason==='matrix'?'pointermove':'pointerup',{...start,clientX:start.clientX+50});}
    assert.equal(editor._layoutDrag,null,reason);assert.equal(Number(ui.inputs.x.value),box.originX,reason);
    assert.equal(editor._layoutDraft.history.length,1,reason);assert.deepEqual(Object.keys(doc.handlers),[],reason);
  }
});
