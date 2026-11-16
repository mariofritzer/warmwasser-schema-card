const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const registry = new Map();
const context = { HTMLElement: class {}, customElements: { get: n => registry.get(n), define: (n,c) => registry.set(n,c) }, window: {}, console: { info() {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../warmwasser-schema-card.js'), 'utf8') + '\nglobalThis.tankState = tankState;', context);
const Card = registry.get('warmwasser-schema-card');

test('split tank sensors follow only their owning tank', () => {
  const card = new Card();
  card.setConfig({ speicher:{typ:'getrennt'}, fm:{pumpe:'sensor.fm'}, fuehler:[
    {name:'Top',entity:'sensor.top',hoehe:10}, {name:'Bottom',entity:'sensor.bottom',hoehe:90},
  ] });
  const m=card._model, top=m.components['sensor-0'], bottom=m.components['sensor-1'];
  assert.equal(top.parent,'hot-tank'); assert.equal(bottom.parent,'buffer-tank');
  const before=[top.origin.x,top.origin.y,bottom.origin.x,bottom.origin.y];
  m.components['hot-tank'].origin.x+=30; m.components['hot-tank'].origin.y-=10;
  assert.deepEqual([top.origin.x,top.origin.y,bottom.origin.x,bottom.origin.y],
    [before[0]+30,before[1]-10,before[2],before[3]]);
  m.components['buffer-tank'].origin.x-=20; m.components['buffer-tank'].origin.y+=15;
  assert.deepEqual([bottom.origin.x,bottom.origin.y],[before[2]-20,before[3]+15]);
});

test('sensor model positions match rendered state for default, clamped and unsorted heights', () => {
  const card = new Card();
  card.setConfig({speicher:{typ:'schicht'},fuehler:[
    {name:'Low',entity:'sensor.low',hoehe:120}, {name:'Auto',entity:'sensor.auto'},
    {name:'High',entity:'sensor.high',hoehe:-10},
  ]});
  const state=context.tankState(card._cfg,()=>42,card._model.geometry.yt);
  assert.deepEqual(Array.from(state.fl,f=>f.index),[2,1,0]);
  for(const f of state.fl) {
    const sensor=card._model.components[`sensor-${f.index}`];
    assert.equal(sensor.parent,'tank');
    assert.equal(sensor.origin.y+15,f.y);
  }
  assert.deepEqual(Array.from(state.fl,f=>f.y),[40,195,350]);
});

test('sensor candidates reject overlapping sensors and retain route clearance', () => {
  vm.runInNewContext('globalThis.resolve = resolveLayoutCandidate; globalThis.clearance = inspectTankSensorClearance;', context);
  const raw={speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'},wp:{betrieb:'sensor.wp'},fuehler:[
    {name:'Top',entity:'sensor.top',hoehe:10},{name:'Bottom',entity:'sensor.bottom',hoehe:90},
  ]};
  const card=new Card();card.setConfig(raw);
  const layout={version:2,components:{fm:{x:370,y:14}}};
  const candidate=context.resolve(raw,card._cfg,layout);
  assert.equal(candidate.status,'candidate',JSON.stringify(candidate.errors));
  assert.equal(context.clearance(card._cfg,candidate).reason,'sensor-clearance-bound-only');
  const route=candidate.routes['fm-supply'],original=route.points;
  route.points=[{x:10,y:60},{x:50,y:60}];
  assert.equal(context.clearance(card._cfg,candidate).reason,'sensor-obstacle-contact');
  route.points=original;
  candidate.model.components['sensor-0'].localOrigin.x+=1;
  assert.equal(context.clearance(card._cfg,candidate).reason,'sensor-clearance-unproven');
  const overlapping={...raw,fuehler:[raw.fuehler[0],{...raw.fuehler[1],hoehe:11}]};
  const other=new Card();other.setConfig(overlapping);
  const rejected=context.resolve(overlapping,other._cfg,layout);
  assert.equal(rejected.status,'unsupported');
  assert.equal(rejected.errors[0].code,'sensor-obstacle-contact');
});

test('sensor routing handles FM and air WP across tank types and admits heater proofs',()=>{
  vm.runInNewContext('globalThis.resolve = resolveLayoutCandidate; globalThis.heater = supportsInternalHeaterExperiment; globalThis.prepare = prepareInternalHeaterRouteCandidate;', context);
  for(const typ of ['schicht','trennblech','getrennt']) for(const withWp of [false,true]) {
    const raw={speicher:{typ},fm:{pumpe:'sensor.fm'},...(withWp?{wp:{betrieb:'sensor.wp'}}:{}),fuehler:[
      {name:'Top',entity:'sensor.top',hoehe:10},{name:'Bottom',entity:'sensor.bottom',hoehe:90}]};
    const card=new Card();card.setConfig(raw);
    const x=typ==='getrennt' && withWp?400:370,y=typ==='getrennt'?14:29;
    const candidate=context.resolve(raw,card._cfg,{version:2,components:{fm:{x,y}}});
    assert.equal(candidate.status,'candidate',`${typ} WP=${withWp}: ${JSON.stringify(candidate.errors)}`);
    const heated=new Card();heated.setConfig({...raw,heizstab_oben:{stufe:'sensor.heater'}});
    assert.equal(context.heater(heated._cfg),true);
    heated._hass={language:'en',states:{'sensor.heater':{state:'2'}}};
    const proof=context.prepare(heated,{version:2,components:{fm:{x,y}}});
    assert.equal(proof.reason,'heater-route-inventory-only',`${typ} WP=${withWp}: ${proof.reason}`);
  }
});

test('separated FM routing rejects legend-blocked port escape and accepts a clear nearby position',()=>{
  vm.runInNewContext('globalThis.resolve = resolveLayoutCandidate;', context);
  const raw={speicher:{typ:'getrennt'},fm:{pumpe:'sensor.fm'},fuehler:[
    {name:'Warmwasser',entity:'sensor.ww',hoehe:20},
    {name:'Puffer oben',entity:'sensor.top',hoehe:68},
    {name:'Puffer unten',entity:'sensor.bottom',hoehe:90},
  ]};
  const card=new Card();card.setConfig(raw);
  const ports={'tank.fm-supply':{mode:'auto'},'fm.supply':{mode:'auto'}};
  const resolve=y=>context.resolve(raw,card._cfg,{version:2,components:{fm:{x:254,y}},ports});
  const blocked=resolve(76);
  assert.equal(blocked.status,'unsupported');
  assert.equal(blocked.errors[0].code,'blocked-port');
  assert.equal(resolve(120).status,'candidate');
  const withoutSensors={...raw,fuehler:[]}, other=new Card();other.setConfig(withoutSensors);
  assert.equal(context.resolve(withoutSensors,other._cfg,{version:2,components:{fm:{x:254,y:76}},ports}).status,'candidate');
});

test('experimental sensor labels constrain long names while keeping legacy and short labels unchanged',()=>{
  vm.runInNewContext('globalThis.renderSensors = renderTankSensors;',context);
  const render=(name,layout)=>context.renderSensors({fl:[{name,entity:'sensor.test',index:0,wert:42,y:100}],
    col:()=>'red',more:()=>'',openComponent:()=>'',closeComponent:()=>'',layout});
  for(const name of ['Warmwasser','Puffer oben','Puffer unten']) {
    assert.match(render(name,true),/textLength="50" lengthAdjust="spacingAndGlyphs"/);
    assert.doesNotMatch(render(name,false),/textLength=/);
  }
  assert.doesNotMatch(render('Top',true),/textLength=/);
  assert.doesNotMatch(render('iiiiiiii',true),/textLength=/);
  for(const name of ['WWWWWWW','mmmmmmm','漢字漢字漢字漢']) assert.match(render(name,true),/textLength="50"/);
  assert.match(render('Puffer <unten>',true),/Puffer &lt;unten&gt;/);
});
