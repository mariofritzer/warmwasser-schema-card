// Integration probe for the canonical one-circuit WP/heating configuration.
// This exercises existing low-level primitives; it does not enable editor routing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { card, resolveHeatingGeometry, resolveLegacyWpHeatingIncidences,
  validateDirectedFixedPolyline, routeDirectedJunctionConnection,
  compileDirectedJunctionBatch, routeDiagramConnections } = require('./helpers/routing-harness.cjs');

const fixture = () => card('schicht', { fm:null, wp:{betrieb:'sensor.wp'}, heizkreise:[{vorlauf:'sensor.vl'}] });
const absolute = (m, ref) => {
  const j = m.junctions[ref];
  if (j) return {ref, x:j.x, y:j.y};
  const [id, name] = ref.split('.'), c = m.components[id], p = c.ports[name];
  return {ref, x:c.origin.x + p.x, y:c.origin.y + p.y};
};
const plain = value => JSON.parse(JSON.stringify(value));

for (const dy of [0, 10]) test(`model-derived supply rail and directed branch compile around obstacle (manifold offset ${dy})`, () => {
  const c = fixture(), m = c._model;
  m.components.manifolds.origin.y += dy;
  const before = plain(m), resolved = resolveLegacyWpHeatingIncidences(m);
  assert.equal(resolved.status, 'resolved');
  const incidence = (ref, id) => resolved.junctions.find(j => j.ref === ref).incidences.find(i => i.connectionId === id).side;
  const edge = m.connections['manifold-supply'];
  const nodes = [edge.from, ...edge.via, edge.to].map(ref => absolute(m, ref));
  const geometry = resolveHeatingGeometry(m).rails.find(r => r.id === edge.id);
  assert.deepEqual(plain([nodes[0], nodes.at(-1)].map(({x,y}) => ({x,y}))), plain(geometry.points));
  const obstacle = {x:286,y:280,width:18,height:40};
  const policy = {obstacles:[obstacle]};
  const rail = validateDirectedFixedPolyline({id:edge.id,role:'supply',points:nodes.map(({x,y}) => ({x,y})),nodes}, policy);
  assert.equal(rail.status, 'routed');
  const from = absolute(m, 'supply-tee'), to = absolute(m, 'manifold-primary-supply');
  const request = {id:'hk-supply',from:{...from,direction:incidence(from.ref,'hk-supply')},
    to:{...to,direction:incidence(to.ref,'hk-supply')},junctions:[],obstacles:policy.obstacles,clearance:13,lead:20};
  const branch = routeDirectedJunctionConnection(request);
  assert.equal(branch.status, 'routed');
  assert.ok(branch.points.some(p => p.x < obstacle.x), 'detours around the obstacle');
  const batch = compileDirectedJunctionBatch([rail, branch], policy);
  assert.equal(batch.status, 'routed');
  assert.deepEqual(plain(routeDirectedJunctionConnection(request)), plain(branch));
  const unrelated = routeDirectedJunctionConnection({...request,to:{...request.to,ref:'coincident-unrelated'}});
  assert.equal(compileDirectedJunctionBatch([rail, unrelated], policy).code, 'unnamed-contact');
  assert.deepEqual(plain(m), before, 'geometry and routing do not mutate the model');
  // Legacy SVG draws the full rail on the same centerline, including separate caps.
  const svg = c._render(), a = nodes[0], b = nodes.at(-1);
  assert.ok(svg.includes(`d="M${a.x} ${a.y}H${b.x}" stroke="#000"`));
  assert.ok(svg.includes(`x="${a.x - 5}" y="${a.y - 10}" width="5" height="20"`));
  assert.ok(svg.includes(`x="${b.x}" y="${b.y - 10}" width="5" height="20"`));
});

test('current model router reports heating connections explicitly unsupported', t => {
  const m = fixture()._model;
  const result = routeDiagramConnections(m, ['hk-supply','hk-return']);
  for (const id of ['hk-supply','hk-return']) {
    if (result[id].status === 'routed') continue; // support can be added without breaking this probe
    assert.equal(result[id].status, 'unsupported');
    t.diagnostic(`${id}: ${result[id].reason}`);
  }
});

test.todo('production heating batch includes both rails, all incident legs and other interacting pipes, and paints/animates the compiled paths');
test.todo('heating router supports mixer, pump, separator, multiple circuits and safe moved layouts');
