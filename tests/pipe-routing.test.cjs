const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeDiagramConnections: route, routeOrthogonalConnection: core, compilePipeRoutes: compile, card } = require('./helpers/routing-harness.cjs');
const plain = x => JSON.parse(JSON.stringify(x));
const port = (x,y,direction,owner) => ({x,y,direction,owner});
const segmentRoute = (id,points,nodes=[]) => ({id,points:points.map(([x,y])=>({x,y})),nodes});
function checkOrthogonal(points) {
  for (let i=1;i<points.length;i++) assert.ok((points[i-1].x===points[i].x) !== (points[i-1].y===points[i].y));
}
test('core routes deterministically with outward tangents, ordered via and padded obstacle', () => {
  const req={from:port(0,0,'right','a'),to:port(120,60,'left','b'),vias:[{id:'v1',x:30,y:20},{id:'v2',x:80,y:40}],obstacles:[{x:50,y:15,width:10,height:15}],clearance:6};
  const r=core(req); assert.equal(r.status,'routed'); checkOrthogonal(r.points); assert.deepEqual(plain(core(req)),plain(r));
  assert.ok(r.points[1].x>0 && r.points[1].y===0); assert.ok(r.points.at(-2).x<120 && r.points.at(-2).y===60);
  const i=r.points.findIndex(p=>p.x===30&&p.y===20), j=r.points.findIndex(p=>p.x===80&&p.y===40); assert.ok(i>=0&&j>i);
  for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k]; assert.ok(!(a.y===b.y && a.y>=9 && a.y<=36 && Math.max(a.x,b.x)>=44 && Math.min(a.x,b.x)<=66)); assert.ok(!(a.x===b.x && a.x>=44 && a.x<=66 && Math.max(a.y,b.y)>=9 && Math.min(a.y,b.y)<=36));}
});
test('blocked port and impossible via fail explicitly', () => {
  const req={from:port(0,0,'right','a'),to:port(100,0,'left','b'),obstacles:[{x:5,y:-5,width:10,height:10}]};
  assert.equal(core(req).code,'blocked-port');
  req.obstacles=[{x:45,y:15,width:10,height:10}];req.vias=[{id:'v',x:50,y:20}]; assert.equal(core(req).code,'no-route');
});
test('batch crossing honors junction identity and is deterministic regardless of input order', () => {
  const a=segmentRoute('a',[[0,50],[100,50]]), b=segmentRoute('b',[[50,0],[50,100]]);
  const r=compile([a,b]); assert.equal(r.status,'routed'); assert.match(r.routes.b.path,/A6 6/); assert.deepEqual(plain(compile([b,a])),plain(r));
  a.nodes=[{ref:'one',x:50,y:50}]; b.nodes=[{ref:'two',x:50,y:50}]; assert.match(compile([a,b]).routes.b.path,/A6 6/);
  b.nodes[0].ref='one'; assert.doesNotMatch(compile([a,b]).routes.b.path,/A6 6/);
  assert.equal(compile([segmentRoute('l',[[0,0],[50,0],[50,50]])],{obstacles:[{x:45,y:1,width:1,height:1}]}).code,'curve-obstacle');
});
test('supply role takes bridge priority before ID, with ID fallback for equal or absent roles', () => {
  const supply={...segmentRoute('a-supply',[[0,50],[100,50]]),role:'supply'};
  const ret={...segmentRoute('z-return',[[50,0],[50,100]]),role:'neutral'};
  const r=compile([ret,supply]);
  assert.equal(r.status,'routed');
  assert.deepEqual(plain(r.paintOrder),['z-return','a-supply']);
  assert.equal(r.routes['a-supply'].crossings[0].bridge,true);
  assert.equal(r.routes['z-return'].crossings[0].bridge,false);
  assert.deepEqual(plain(compile([supply,ret])),plain(r));
  for (const role of ['supply','neutral',undefined]) {
    supply.role=role; ret.role=role;
    const tied=compile([ret,supply]);
    assert.deepEqual(plain(tied.paintOrder),['a-supply','z-return']);
    assert.equal(tied.routes['z-return'].crossings[0].bridge,true);
  }
});
test('model resolver reports unknown refs, medium mismatch and fixed policy', () => {
  const c=card(), m=c._model; m.connections['fm-supply'].to='missing.port'; assert.equal(route(m,['fm-supply'])['fm-supply'].code,'unknown-reference');
  m.connections['fm-supply'].to='fm.cold-water'; assert.equal(route(m,['fm-supply'])['fm-supply'].code,'medium-mismatch');
  assert.equal(route(m,['domestic-hot'])['domestic-hot'].reason,'connection-policy');
});
test('FM rendering consumes each compiled path for every layer and state changes preserve geometry', () => {
  for (const type of ['getrennt','trennblech','schicht']) {
    const c=card(type); c._model.components.fm.origin.x+=30; c._model.components.fm.origin.y+=15;
    const routes=route(c._model,['fm-supply','fm-return']), svg=c._render();
    for(const id of ['fm-supply','fm-return']) { const r=routes[id]; assert.equal(r.status,'routed',`${type} ${id}`); checkOrthogonal(r.points); for(const layer of ['w0','w1','w2','w3']) assert.ok(svg.includes(`d="${r.path}" class="${layer}"`),`${type} ${id} ${layer}`); }
    c._hass.states['sensor.pump'].state='off'; assert.deepEqual(plain(route(c._model,['fm-supply','fm-return'])),plain(routes));
    const off=c._render(); for(const id of ['fm-supply','fm-return']) assert.ok(!off.includes(`d="${routes[id].path}" class="w3"`));
  }
});
test('moving a tank resolves its ports locally and routes to the moved endpoints', () => {
  for(const type of ['getrennt','schicht','trennblech']) {
    const c=card(type), m=c._model, tank=m.components[type==='getrennt'?'hot-tank':'tank'];
    tank.origin.x-=15; tank.origin.y+=10;
    const r=route(m,['fm-supply','fm-return']);
    for(const id of ['fm-supply','fm-return']) assert.equal(r[id].status,'routed',`${type} ${id}: ${r[id].code}`);
    assert.deepEqual(plain(r['fm-supply'].points[0]),{x:191,y:56});
    assert.ok(c._render().includes(`d="${r['fm-supply'].path}"`));
  }
});
test('owner escape does not excuse other obstacles and reference bounds are not obstacles', () => {
  const req={from:port(0,0,'right','a'),to:port(100,0,'left','b'),obstacles:[{owner:'a',x:-5,y:-5,width:10,height:10}]};
  assert.equal(core(req).status,'routed');
  req.obstacles.push({owner:'other',x:10,y:-4,width:4,height:8}); assert.equal(core(req).code,'blocked-port');
  const c=card(); c._model.components.fm.bounds={x:-10000,y:-10000,width:20000,height:20000};
  const r=route(c._model,['fm-supply','fm-return']); assert.equal(r['fm-supply'].status,'routed');
});
test('external policy and endpoint directions are required; options cannot silently change routing', () => {
  const c=card(), m=c._model, edge=m.connections['fm-supply'];
  delete edge.routingPolicy; assert.equal(route(m,['fm-supply'])['fm-supply'].reason,'connection-policy');
  edge.routingPolicy='external'; m.junctions.end={id:'end',x:300,y:46,medium:'heating-water'}; edge.to='end';
  assert.equal(route(m,['fm-supply'])['fm-supply'].reason,'direction-required');
  edge.to='fm.supply'; assert.equal(route(m,['fm-supply'],{clearance:0})['fm-supply'].code,'invalid-options');
});
test('painted parallel pipes cannot overlap even when their centerlines do not cross', () => {
  const r=compile([segmentRoute('a',[[0,0],[100,0]]),segmentRoute('b',[[0,4],[100,4]])]);
  assert.equal(r.status,'failed');
  const c=card(); c._model.components.fm.origin.x-=90; c._model.components.fm.origin.y+=120;
  const result=route(c._model,['fm-supply','fm-return']);
  assert.ok(Object.values(result).some(x=>x.status==='failed'));
  assert.throws(()=>c._render());
});
test('compiler preserves inputs and rejects a self-intersecting centerline', () => {
  const input=[segmentRoute('pipe',[[0,0],[100,0],[100,100],[50,100],[50,-20]])], before=plain(input);
  assert.equal(compile(input).status,'failed'); assert.deepEqual(plain(input),before);
  const valid=[segmentRoute('p',[[0,0],[80,0],[80,80]])], snapshot=plain(valid);
  assert.equal(compile(valid).status,'routed'); assert.deepEqual(plain(valid),snapshot);
});
test('sensor readings do not change routed geometry and long labels are explicitly unsupported', () => {
  const c=card('getrennt',{fuehler:[{name:'Top',entity:'sensor.top',hoehe:10}]}); c._hass.states['sensor.top']={state:'22',attributes:{}};
  c._model.components.fm.origin.x+=30; c._model.components.fm.origin.y+=15;
  const before=route(c._model,['fm-supply','fm-return']); assert.equal(before['fm-supply'].status,'routed');
  c._hass.states['sensor.top'].state='65'; assert.deepEqual(plain(route(c._model,['fm-supply','fm-return'])),plain(before));
  const long=card('getrennt',{fuehler:[{name:'A'.repeat(21),entity:'sensor.top'}]}); long._model.components.fm.origin.x+=30;
  assert.throws(()=>long._render(), e=>e.code==='unsupported-configuration');
});
test('unmodeled legionella label makes moved-FM routing unsupported', () => {
  const c=card('getrennt',{legionellen:{aktiv:'sensor.pump'}}); c._model.components.fm.origin.x-=170; c._model.components.fm.origin.y-=110;
  assert.equal(route(c._model,['fm-supply','fm-return'])['fm-return'].reason,'unsupported-configuration');
  assert.throws(()=>c._render(), e=>e.code==='unsupported-configuration');
});
test('perpendicular near-misses include round pipe caps', () => {
  const r=compile([segmentRoute('a',[[0,0],[100,0]]),segmentRoute('b',[[104,4],[104,100]])]);
  assert.equal(r.status,'failed');
});
test('continuous S bends remain valid while hairpins and close collinear caps fail', () => {
  assert.equal(compile([segmentRoute('s',[[0,0],[50,0],[50,3],[100,3]])]).status,'routed');
  assert.equal(compile([segmentRoute('hairpin',[[0,0],[100,0],[100,4],[0,4]])]).status,'failed');
  assert.equal(compile([segmentRoute('a',[[0,0],[100,0]]),segmentRoute('b',[[104,0],[200,0]])]).status,'failed');
  assert.equal(compile([segmentRoute('a',[[0,0],[100,0]]),segmentRoute('b',[[111,0],[200,0]])]).status,'routed');
});
test('moved FM domestic pipes, open ends and labels follow its ports', () => {
  for (const type of ['getrennt', 'schicht', 'trennblech']) {
    const c=card(type), m=c._model;
    m.components.fm.origin.x+=60; m.components.fm.origin.y+=15;
    const svg=c._render();
    for (const fragment of [
      'd="M422 -11V27"', 'd="M488 27V-11"',
      'd="M418-8l4 4 4-4"', 'd="M484-4l4-4 4 4"',
      '<text x="414" y="1"', '<text x="496" y="1"',
    ]) assert.ok(svg.includes(fragment), `${type}: ${fragment}`);
  }
});
test('routed FM paths leave and enter every port along its outward tangent', () => {
  const vector={left:[-1,0],right:[1,0],top:[0,-1],bottom:[0,1]};
  for (const type of ['getrennt','schicht','trennblech']) {
    const c=card(type); c._model.components.fm.origin.x+=60; c._model.components.fm.origin.y+=15;
    const results=route(c._model,['fm-supply','fm-return']);
    for (const [id,result] of Object.entries(results)) {
      assert.equal(result.status,'routed',`${type}: ${id}`);
      const edge=c._model.connections[id];
      for (const [ref,first] of [[edge.from,true],[edge.to,false]]) {
        const [owner,name]=ref.split('.'), component=c._model.components[owner], port=component.ports[name];
        const endpoint=first ? result.points[0] : result.points.at(-1);
        const adjacent=first ? result.points[1] : result.points.at(-2);
        const [dx,dy]=vector[port.direction];
        assert.equal(endpoint.x,component.origin.x+port.x); assert.equal(endpoint.y,component.origin.y+port.y);
        assert.ok((adjacent.x-endpoint.x)*dx+(adjacent.y-endpoint.y)*dy>0,`${type}: ${id} ${ref}`);
        assert.equal((adjacent.x-endpoint.x)*dy-(adjacent.y-endpoint.y)*dx,0,`${type}: ${id} ${ref}`);
      }
    }
  }
});
test('bridges retain clearance from endpoints and from other bridges', () => {
  const horizontal=segmentRoute('horizontal',[[0,0],[100,0]]);
  assert.equal(compile([horizontal,segmentRoute('vertical',[[50,-11],[50,100]])]).code,'crossing-near-corner');
  assert.equal(compile([horizontal,segmentRoute('vertical',[[50,-12],[50,100]])]).status,'routed');
  const first=segmentRoute('first',[[40,-50],[40,50]]);
  const second=segmentRoute('second',[[60,-50],[60,50]]);
  // Naming makes the horizontal pipe paint last and own both bridges.
  horizontal.id='z-horizontal';
  assert.equal(compile([horizontal,first,second]).code,'crossings-too-close');
});
test('domestic boundary, circulation assembly and tees follow the FM parent', () => {
  const c=card('schicht',{zirkulationspumpe:'sensor.pump',trinkwasser:{zaehler:'sensor.meter'}}), m=c._model;
  const coords=()=>Object.fromEntries([
    ...['domestic-boundary','domestic-meter','circulation-pump'].map(id=>[id,[m.components[id].origin.x,m.components[id].origin.y]]),
    ...['domestic-cold-tee','domestic-hot-tee','domestic-meter-point'].map(id=>[id,[m.junctions[id].x,m.junctions[id].y]])
  ]);
  const before=coords(); m.components.fm.origin.x+=60; m.components.fm.origin.y+=15;
  for(const [id,[x,y]] of Object.entries(coords())) assert.deepEqual([x,y],[before[id][0]+60,before[id][1]+15],id);
  assert.throws(()=>c._render(),e=>e.code==='unsupported-configuration');
});
