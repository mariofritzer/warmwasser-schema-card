const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeDiagramConnections: route, card } = require('./helpers/routing-harness.cjs');
const ids = ['fm-supply','fm-return','wp-upper-supply','wp-lower-supply','wp-upper-return','wp-lower-return','wp-valve-return'];
const plain = x => JSON.parse(JSON.stringify(x));
function fixture(type, extra = {}) {
  const c = card(type, { wp: { typ:'luft', betrieb:'sensor.wp', ventil:'sensor.valve', kuehlen:'sensor.cool', ...extra } });
  Object.assign(c._hass.states, {
    'sensor.wp': {state:'on', attributes:{}}, 'sensor.valve': {state:'100', attributes:{}},
    'sensor.cool': {state:'off', attributes:{}}, 'sensor.energy': {state:'42', attributes:{}}
  });
  return c;
}
function routed(c) {
  const results = route(c._model, ids);
  for (const id of ids) assert.equal(results[id].status, 'routed', `${id}: ${results[id].code || results[id].reason}`);
  return results;
}
function assertLayers(svg, results) {
  for (const id of ids) for (const layer of ['w0','w1','w2'])
    assert.ok(svg.includes(`d="${results[id].path}" class="${layer}"`), `${id}: ${layer}`);
}
test('moved FM and Luft-WP share one batch across all tank types', () => {
  for (const type of ['getrennt','schicht','trennblech']) {
    const c = fixture(type); c._model.components.fm.origin.x += type === 'getrennt' ? 60 : 30; c._model.components.fm.origin.y += 15;
    const results = routed(c); assertLayers(c._render(), results);
    assert.deepEqual(plain(route(c._model, [...ids].reverse())), plain(results));
    assert.ok(Object.values(results).some(r => /A6 6/.test(r.path)), `${type}: expected a real bridge`);
  }
});
test('each crossing bridge is painted after every layer of the crossing pipe', () => {
  for (const type of ['getrennt','schicht','trennblech']) {
    const c=fixture(type); c._model.components.fm.origin.x += type === 'getrennt' ? 60 : 30; c._model.components.fm.origin.y += 15;
    c._hass.states['sensor.valve'].state='50';
    const results=routed(c), svg=c._render();
    assert.deepEqual(plain(route(c._model,[...ids].reverse())),plain(results));
    assert.ok(results['wp-lower-supply'].crossings.some(x=>x.otherId==='wp-upper-return' && x.bridge),`${type}: lower supply owns bridge`);
    assert.ok(results['wp-upper-return'].crossings.some(x=>x.otherId==='wp-lower-supply' && !x.bridge),`${type}: upper return stays below`);
    if (type==='getrennt') {
      assert.ok(results['wp-upper-supply'].crossings.some(x=>x.otherId==='fm-return' && x.bridge));
      assert.ok(results['fm-return'].crossings.some(x=>x.otherId==='wp-upper-supply' && !x.bridge));
    }
    let bridges=0;
    for (const [id, routeResult] of Object.entries(results)) for (const crossing of routeResult.crossings) {
      if (!crossing.bridge) continue;
      bridges++;
      const other=results[crossing.otherId];
      const ownLayers=['w0','w1','w2','w3'].map(layer=>svg.indexOf(`d="${routeResult.path}" class="${layer}"`));
      const otherLayers=['w0','w1','w2','w3'].map(layer=>svg.indexOf(`d="${other.path}" class="${layer}"`));
      assert.ok(ownLayers.every(i=>i>=0),`${type}: ${id} layers`);
      assert.ok(otherLayers.every(i=>i>=0),`${type}: ${crossing.otherId} layers`);
      assert.ok(Math.min(...ownLayers)>Math.max(...otherLayers),`${type}: ${id} bridge must paint after ${crossing.otherId}`);
    }
    assert.ok(bridges,`${type}: expected crossings`);
  }
});
test('WP operating states alter animation, not geometry, including cooling and standby', () => {
  const c = fixture('schicht'); c._model.components.fm.origin.x += 30; c._model.components.fm.origin.y += 15;
  const baseline = routed(c); let previous;
  for (const [operation,valve,cool] of [['on','100','off'],['on','0','off'],['on','100','on'],['off','100','off']]) {
    c._hass.states['sensor.wp'].state=operation; c._hass.states['sensor.valve'].state=valve; c._hass.states['sensor.cool'].state=cool;
    assert.deepEqual(plain(routed(c)), plain(baseline));
    const svg = c._render(); assertLayers(svg, baseline);
    if (previous !== undefined) assert.notEqual(svg, previous);
    previous = svg;
    for (const id of ids.filter(id => id.startsWith('wp-'))) {
      const active = operation === 'on' && (id === 'wp-valve-return' || (valve === '100' ? id.includes('upper') : id.includes('lower')));
      assert.equal(svg.includes(`d="${baseline[id].path}" class="w3"`), active, `${operation}/${valve}/${cool}: ${id}`);
    }
  }
});
test('missing or contradictory endpoint roles do not imply supply priority', () => {
  for (const role of ['return',undefined]) {
    const c=fixture('schicht'); c._model.components.fm.origin.x+=30; c._model.components.fm.origin.y+=15;
    c._model.components.wp.ports['lower-supply'].role=role;
    const results=routed(c);
    assert.ok(results['wp-upper-return'].crossings.some(x=>x.otherId==='wp-lower-supply' && x.bridge));
    assert.ok(results['wp-lower-supply'].crossings.some(x=>x.otherId==='wp-upper-return' && !x.bridge));
  }
});
test('WP meter remains canonical but fails closed after movement', () => {
  const c=fixture('schicht',{wmz:'sensor.energy'}), canonical=c._render();
  c._model.components.fm.origin.x += 30; c._model.components.fm.origin.y += 15;
  assert.throws(() => c._render(), e => e.code === 'unsupported-configuration');
  c._model.components.fm.origin.x -= 30; c._model.components.fm.origin.y -= 15;
  assert.equal(c._render(), canonical);
});
test('moving the tank, heat pump or valve reroutes the whole batch', () => {
  for (const type of ['schicht','trennblech']) for (const id of ['tank','wp','valve']) {
    const c=fixture(type); c._model.components[id].origin.x += 5;
    const results=routed(c); assertLayers(c._render(),results);
  }
});
test('split tank batch rejects an unnamed contact and tracks moved component endpoints', () => {
  const blocked=fixture('getrennt'); blocked._model.components.fm.origin.x += 30; blocked._model.components.fm.origin.y += 15;
  assert.ok(Object.values(route(blocked._model,ids)).some(r=>r.code==='unnamed-contact'));
  assert.throws(()=>blocked._render(),e=>e.code==='unnamed-contact');
  for (const component of ['hot-tank','buffer-tank','wp','valve']) {
    const c=fixture('getrennt'); c._model.components.fm.origin.x += 60; c._model.components.fm.origin.y += 15;
    const before=routed(c); c._model.components[component].origin.x += 5; const after=routed(c);
    let connected=0;
    for (const id of ids) {
      const edge=c._model.connections[id];
      for (const [side,index] of [['from',0],['to',-1]]) if (edge[side].startsWith(component+'.')) {
        connected++;
        assert.equal(after[id].points.at(index).x,before[id].points.at(index).x+5,`${component}: ${id}.${side}`);
        assert.equal(after[id].points.at(index).y,before[id].points.at(index).y,`${component}: ${id}.${side}`);
      }
    }
    assert.ok(connected,component); assertLayers(c._render(),after);
  }
});
test('sensor readings do not change geometry and unrelated equipment stays unsupported', () => {
  const c=fixture('schicht'); c._model.components.fm.origin.x += 30; c._model.components.fm.origin.y += 15;
  const before=routed(c); c._hass.states['sensor.pump'].state='off'; c._hass.states['sensor.valve'].state='0';
  assert.deepEqual(plain(routed(c)),plain(before));
  for (const extra of [{solar:{pumpe:'sensor.pump'}},{heizkreise:[{pumpe:'sensor.pump'}]}]) {
    const unsupported=card('schicht',{wp:{typ:'luft',betrieb:'sensor.wp'},...extra});
    unsupported._model.components.fm.origin.x += 30;
    assert.throws(()=>unsupported._render(),e=>e.code==='unsupported-configuration');
  }
});
test('WP and FM formatted readings preserve geometry; extreme readings fail only when routing is active', () => {
  const fields = ['leistung','cop','waerme','vorlauf','ruecklauf'];
  const wp = Object.fromEntries(fields.map(name => [name,`sensor.${name}`]));
  const c=card('schicht',{wp:{typ:'luft',betrieb:'sensor.wp',...wp},fm:{pumpe:'sensor.pump',temp:'sensor.fm_temp',durchfluss:'sensor.fm_flow'}});
  c._hass.states['sensor.wp']={state:'on',attributes:{}};
  for (const name of [...fields,'fm_temp','fm_flow']) c._hass.states[`sensor.${name}`]={state:'12.3',attributes:{}};
  const canonical=c._render(); c._model.components.fm.origin.x+=30; c._model.components.fm.origin.y+=15;
  const geometry=routed(c); assertLayers(c._render(),geometry);
  for (const name of [...fields,'fm_temp','fm_flow']) {
    c._hass.states[`sensor.${name}`].state='25.4';
    assert.deepEqual(plain(routed(c)),plain(geometry)); assertLayers(c._render(),geometry);
    c._hass.states[`sensor.${name}`].state='99999999999999999999';
    c._model.components.fm.origin.x-=30; c._model.components.fm.origin.y-=15;
    const extremeCanonical=c._render();
    c._model.components.fm.origin.x+=30; c._model.components.fm.origin.y+=15;
    assert.throws(()=>c._render(),e=>e.code==='label-overflow',`${name} extreme reading`);
    c._model.components.fm.origin.x-=30; c._model.components.fm.origin.y-=15;
    assert.equal(c._render(),extremeCanonical,`${name} canonical`);
    c._model.components.fm.origin.x+=30; c._model.components.fm.origin.y+=15;
    c._hass.states[`sensor.${name}`].state='12.3';
  }
  c._model.components.fm.origin.x-=30; c._model.components.fm.origin.y-=15;
  assert.equal(c._render(),canonical);
});
test('heat output and English default status render without a power sensor', () => {
  const c=fixture('schicht',{waerme:'sensor.heat'}); c._hass.states['sensor.heat']={state:'12300',attributes:{}};
  c._model.components.fm.origin.x+=30; c._model.components.fm.origin.y+=15;
  assert.ok(c._render().includes('Wärme 12.30 kW'));
  const english=fixture('schicht'); english._hass.language='en';
  english._model.components.fm.origin.x+=30; english._model.components.fm.origin.y+=15;
  assert.ok(english._render().includes('Compressor on'));
});
test('partial WP/FM batches and unbounded WP labels fail closed', () => {
  const c=fixture('schicht'); c._model.components.fm.origin.x += 30;
  assert.ok(Object.values(route(c._model,['fm-supply','fm-return'])).every(r=>r.status==='unsupported' && r.reason==='incomplete-batch'));
  for (const wp of [{sg_ready:'sensor.wp'},{quelle_ein:'sensor.wp'},{quelle_aus:'sensor.wp'}]) {
    const other=fixture('schicht',wp); other._model.components.fm.origin.x += 30;
    assert.throws(()=>other._render(),e=>e.code==='unsupported-configuration');
  }
  const named=card('schicht',{name_wp:'abcdef',wp:{typ:'luft',betrieb:'sensor.wp'}}); named._model.components.fm.origin.x += 30;
  assert.throws(()=>named._render(),e=>e.code==='unsupported-configuration');
});
test('a blocked FM port fails closed when WP is present', () => {
  const c=fixture('schicht'); c._model.components.fm.origin.x += 30; c._model.components.fm.origin.y += 15;
  c._model.components.blocker={origin:{x:0,y:0},baseOrigin:{x:0,y:0},bounds:{x:0,y:0,width:0,height:0},ports:{},routingAreas:[{x:205,y:35,width:40,height:22}]};
  assert.ok(Object.values(route(c._model,ids)).some(r=>r.status==='failed'));
  assert.throws(() => c._render());
});
