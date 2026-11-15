# WP + HK preview limits

`heating-batch-preview.html` is an internal, opt-in test page. It renders the model-bound nine-line batch with sample HA states and does not enable editor routing. The currently accepted model has no heating-circuit pump; it cannot demonstrate a running HK.

To support a real running circuit, extend the model-bound batch and its incidence inventory to include `heating-pump-0` and its inlet, through-pump and outlet connections. Route those together with all existing WP, tank, valve, rail and HK connections; validate the pump's complete painted body, port escapes, animated halo and labels against every route and rail. Derive active flow and durations from the existing `heatPumpState` and `heatingCircuitState` functions, and exercise WP upper/lower/split and pump on/off combinations, including reversed tee-to-tank animation and bridge geometry.

Before enabling a real editor path, additionally bind current HA state and configuration to the rendered candidate, cover all labels, strokes, shadows, rail and pipe paint ordering and animation phases, and prove that connected staging and the committed card share the same geometry and styling. Any unproven variant must remain unsupported. The synthetic full-route preview mode is not a source of operational animation state.
