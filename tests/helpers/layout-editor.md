# Local layout editor harness

Open `tests/helpers/layout-editor.html` directly in a browser (or serve the repository with `python3 -m http.server` and visit `/tests/helpers/layout-editor.html`). No Home Assistant server, packages, or build step is needed. The page loads the real card and editor from `warmwasser-schema-card.js`; `ha-form`, icons, entity states, and the Home Assistant `config-changed` echo are local mocks. Only this editor instance overrides the closed visual editor gate.

Click FM or WP in the diagram to select it, drag that device with a mouse or touch, change coordinates, use the arrow buttons or focus the preview and use arrow keys (Shift moves ten units), then try Undo, Redo, and Apply. A drag moves the selected component and one Undo reverses the whole gesture; canceling a gesture restores its start. The page shows the latest emitted configuration. Reset restores the fixture. The overflow button changes a mocked live sensor value to exercise canonical fallback and recovery; the WP button disables or restores the device while retaining any saved layout. Invalid drafts keep Apply disabled.

Click **Run smoke checks** to exercise the pointer overlay, candidate preview, undo/redo, synchronous configuration echo, live fallback/recovery, and reload. The overlay check verifies its size and touch-action; it does not synthesize trusted mouse or touch gestures, so exercise dragging manually. Appending `?smoke=1` runs the same checks on load. The harness is an isolated browser test, not a substitute for testing inside Home Assistant.

If the configuration changes while a draft is pending, Apply is blocked until you explicitly continue with that draft on the current card or discard it. An invalid position is shown as a dashed “Unchecked” marker over the canonical diagram; it is not a validated route.

The **Load separated tank fixture** button loads a guarded FM/WP example with the tank connector pair on the left and the FM pair on the right. The port controls apply to each pair together. Try Standard, Auto, Left, and Right; only configurations whose full pipe batch passes validation can be applied.
