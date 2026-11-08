const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const registry = new Map();
const context = { HTMLElement: class {}, customElements: { get: n => registry.get(n), define: (n,c) => registry.set(n,c) }, window: {}, console: { info() {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../warmwasser-schema-card.js'), 'utf8') + '\nglobalThis.api = { routeDiagramConnections, routeOrthogonalConnection, routeDirectedJunctionConnection, validateDirectedFixedPolyline, compileDirectedJunctionBatch, compilePipeRoutes, resolveHeatingGeometry, resolveHeatingEndpointGeometry, heatingCircuitState };', context);
function card(type = 'getrennt', extra = {}) {
  const c = new (registry.get('warmwasser-schema-card'))();
  c.setConfig({ speicher: { typ:type }, fm:{ pumpe:'sensor.pump' }, ...extra });
  c._hass = { language:'de', states:{ 'sensor.pump':{ state:'on', attributes:{} } } };
  return c;
}
module.exports = { ...context.api, card };
