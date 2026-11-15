# Local layout editor harness

Open `tests/helpers/layout-editor.html` directly in a browser (or serve the repository with `python3 -m http.server` and visit `/tests/helpers/layout-editor.html`). No Home Assistant server, packages, or build step is needed. The page loads the real card and editor from `warmwasser-schema-card.js`; `ha-form`, icons, entity states, and the Home Assistant `config-changed` echo are local mocks. Only this editor instance overrides the closed visual editor gate.

Select FM or WP, change coordinates, use the arrow buttons or focus the preview and use arrow keys (Shift moves ten units), then try Undo, Redo, and Apply. The page shows the latest emitted configuration. Reset restores the fixture. The overflow button changes a mocked live sensor value to exercise canonical fallback and recovery; the WP button disables or restores the device while retaining any saved layout. Invalid drafts keep Apply disabled.

Click **Run smoke checks** to exercise candidate preview, undo/redo, synchronous configuration echo, live fallback/recovery, and reload. Appending `?smoke=1` runs the same checks on load. The harness is an isolated browser test, not a substitute for testing inside Home Assistant.
