# Local layout editor harness

Open `tests/helpers/layout-editor.html` directly in a browser (or serve the repository with `python3 -m http.server` and visit `/tests/helpers/layout-editor.html`). No Home Assistant server, packages, or build step is needed. The page loads the real card and editor from `warmwasser-schema-card.js`; `ha-form`, icons, entity states, and the Home Assistant `config-changed` echo are local mocks. Only this editor instance overrides the closed visual editor gate.

Click FM or WP in the diagram to select it, drag that device with a mouse or touch, change coordinates, use the arrow buttons or focus the preview and use arrow keys (Shift moves ten units), then try Undo, Redo, and Apply. A drag moves the selected component and one Undo reverses the whole gesture; canceling a gesture restores its start. The page shows the latest emitted configuration. Reset restores the fixture. The overflow button changes a mocked live sensor value to exercise canonical fallback and recovery; the WP button disables or restores the device while retaining any saved layout. Invalid drafts keep Apply disabled.

Click **Run smoke checks** to exercise the pointer overlay, candidate preview, undo/redo, synchronous configuration echo, live fallback/recovery, and reload. The overlay check verifies that only device hit areas disable native touch handling; it does not synthesize trusted mouse or touch gestures. Appending `?smoke=1` runs the same checks on load. The harness is an isolated browser test, not a substitute for testing inside Home Assistant.

Click **Resize revalidation check** in a browser with at least 420 px of available editor width to check that changing the editor width creates a fresh text-validation job and restores Apply at 320, 390, and 420 px. This does not simulate touch input.

For a physical touchscreen check, use **Touch diagnostics 320 px** and **Touch diagnostics 390 px**. At each width: drag a device and verify its coordinates move; scroll and pinch on empty diagram space; then start another drag, add a second finger, and verify the draft returns to its starting coordinates. Also change the viewport or scroll the page while holding a device and confirm the gesture is canceled. The diagnostics report browser pointer and scroll events, but do not themselves automate touch input or establish real-device coverage.

If the configuration changes while a draft is pending, Apply is blocked until you explicitly continue with that draft on the current card or discard it. An invalid position is shown as a dashed “Unchecked” marker over the canonical diagram; it is not a validated route.

The **Load separated tank fixture** button loads a guarded FM/WP example with the tank connector pair on the left and the FM pair on the right. The port controls apply to each pair together. Try Standard, Auto, Left, and Right; only configurations whose full pipe batch passes validation can be applied.

The **FM + WP SG Ready Apply/reload** check exercises an air heat pump with a live SG Ready entity. It changes the state, checks overflow rejection and recovery, applies the editor draft, reloads the card, and checks canonical fallback for an oversized value. The normal public gates remain closed.

The **FM + WP source temperatures Apply/reload** check exercises live air-source temperatures, including updated values, overflow rejection and recovery, editor Apply, card reload and canonical fallback. This test does not open the public gates.

The **Heater geometry and SVG probe** is an internal diagnostic for a stratified tank with an upper heater. It checks the routed FM batch and connected heater SVG in active and inactive states. It does not validate text collision, complete paint, Apply, or release the editor gate.
