const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const registry=new Map(),ctx={HTMLElement:class{},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+'\nglobalThis.resolve=resolveLayoutCandidate;globalThis.clearance=inspectCirculationClearance;globalThis.heater=supportsInternalHeaterExperiment;',ctx);
const Card=registry.get('warmwasser-schema-card');
const raw=typ=>({speicher:{typ},fm:{pumpe:'sensor.fm'},zirkulationspumpe:'switch.zirk'});
for(const typ of ['schicht','trennblech','getrennt'])test(`${typ} circulation follows FM and proves its complete clearance`,()=>{
  const config=raw(typ),card=new Card();card.setConfig(config);
  const original=JSON.stringify(card._model),result=ctx.resolve(config,card._cfg,{version:2,components:{fm:{x:370,y:29}}});
  assert.equal(result.status,'candidate',JSON.stringify(result.errors));assert.equal(JSON.stringify(card._model),original);
  assert.equal(result.model.components['circulation-pump'].origin.x,415);
  assert.equal(result.model.components['circulation-pump'].origin.y,-1);
  assert.equal(ctx.clearance(card._cfg,result).reason,'circulation-clearance-bound-only');
  const pipe=result.routes['fm-supply'],saved=pipe.points;pipe.points=[{x:410,y:0},{x:450,y:0}];
  assert.equal(ctx.clearance(card._cfg,result).reason,'circulation-obstacle-contact');pipe.points=saved;
  result.model.components['circulation-pump'].localOrigin.x++;
  assert.equal(ctx.clearance(card._cfg,result).reason,'circulation-clearance-unproven');
});
test('unproven circulation combinations stay gated',()=>{
  for(const extra of [{heizstab_oben:{stufe:'sensor.heater'}},{trinkwasser:{temp:'sensor.temp'}}]) {
    const config={...raw('schicht'),...extra},card=new Card();card.setConfig(config);
    assert.equal(ctx.resolve(config,card._cfg,{version:2,components:{fm:{x:370,y:29}}}).status,'unsupported');
    if(extra.heizstab_oben)assert.equal(ctx.heater(card._cfg),false);
  }
});

test('circulation and sensors are checked together',()=>{
  const config={...raw('schicht'),fuehler:[{entity:'sensor.temp',name:'Top',hoehe:10}]},card=new Card();card.setConfig(config);
  const candidate=ctx.resolve(config,card._cfg,{version:2,components:{fm:{x:370,y:29}}});
  assert.equal(candidate.status,'candidate',JSON.stringify(candidate.errors));
  assert.equal(ctx.clearance(card._cfg,candidate).reason,'circulation-clearance-bound-only');
  const sensor=candidate.model.components['sensor-0'];sensor.localOrigin.x+=380;sensor.localOrigin.y-=80;
  assert.equal(ctx.clearance(card._cfg,candidate).reason,'circulation-obstacle-contact');
});

test('circulation supports a moved air heat pump',()=>{
  const config={...raw('schicht'),wp:{betrieb:'sensor.wp'}},card=new Card();card.setConfig(config);
  const result=ctx.resolve(config,card._cfg,{version:2,components:{fm:{x:370,y:29},wp:{x:360,y:165}}});
  assert.equal(result.status,'candidate',JSON.stringify(result.errors));
  assert.equal(ctx.clearance(card._cfg,result).reason,'circulation-clearance-bound-only');
});
test('animated pump envelope rejects changed keyframes, extra effects and off-center transforms',()=>{
  vm.runInNewContext('globalThis.animation=inspectCirculationRingAnimation;',ctx);
  const frames=[{opacity:'0.8',computedOffset:0,easing:'ease'},{opacity:'0',transform:'scale(1.8)',computedOffset:1}],timing={duration:1600,iterations:Infinity,delay:0,direction:'normal',easing:'linear'},style={animationName:'wp',animationDuration:'1.6s',animationIterationCount:'infinite',transformBox:'fill-box'};
  const animation={animationName:'wp',playbackRate:1,effect:{getTiming:()=>timing,getKeyframes:()=>frames}},animations=[animation];
  const svg={ownerDocument:{defaultView:{getComputedStyle:()=>style}},getScreenCTM:()=>({a:1,b:0,c:0,d:1,e:0,f:0})},pump={origin:{x:385,y:-16}};
  let matrix={a:1.5,b:0,c:0,d:1.5,e:-197.5,f:3};const ring={getAnimations:()=>animations,getScreenCTM:()=>matrix};animation.effect.target=ring;
  assert.equal(ctx.animation(svg,ring,pump),true);
  frames[1].translate='100px';assert.equal(ctx.animation(svg,ring,pump),false);delete frames[1].translate;
  frames[0].composite='add';assert.equal(ctx.animation(svg,ring,pump),false);delete frames[0].composite;
  frames[0].transform='scale(3)';assert.equal(ctx.animation(svg,ring,pump),false);delete frames[0].transform;
  frames[0].easing='cubic-bezier(0, 3, 1, 3)';assert.equal(ctx.animation(svg,ring,pump),false);frames[0].easing='ease';
  frames[1].transform='scale(2)';assert.equal(ctx.animation(svg,ring,pump),false);frames[1].transform='scale(1.8)';
  animations.push(animation);assert.equal(ctx.animation(svg,ring,pump),false);animations.pop();
  matrix={...matrix,e:0};assert.equal(ctx.animation(svg,ring,pump),false);
});
