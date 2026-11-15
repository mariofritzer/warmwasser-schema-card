# WP + HK preview limits

`heating-batch-preview.html` is an internal, opt-in test page. It renders the model-bound eleven-line batch with a single unmixed heating-circuit pump and sample HA states; it does not enable editor routing. One continuous animated path crosses the A11 bridge and pump to preserve its dash phase.

The **Full card experiment / Ganze Karte** button uses the real card renderer with an internal atomic pipe phase. It retains the card's own pump, valve, tee, label, tank and WP rendering. The result remains `unsupported` and is installed only into the local test page.

The checked inventory includes `heating-pump-0`, its inlet, through-pump and outlet connections, and the maximum pump halo. Active flow and durations come from the existing `heatPumpState` and `heatingCircuitState` functions. The current narrow geometry does not imply support for mixers, multiple circuits or arbitrary pump placement.

Before enabling a real editor path, additionally bind current HA state and configuration to the rendered candidate, cover all labels, strokes, shadows, rail and pipe paint ordering and animation phases, and prove that connected staging and the committed card share the same geometry and styling. Any unproven variant must remain unsupported. The synthetic full-route preview mode is not a source of operational animation state.
