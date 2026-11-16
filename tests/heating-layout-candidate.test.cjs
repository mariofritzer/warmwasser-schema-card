const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const registry=new Map();
const context={HTMLElement:class {},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.api={resolveLayoutCandidate,prepareLayoutCandidate,preflightLayoutRender,renderInternalWpHeatingCandidate};',context);
const {resolveLayoutCandidate:resolve,prepareLayoutCandidate:prepare,preflightLayoutRender:preflight,renderInternalWpHeatingCandidate:render}=context.api;
const raw={speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp',ventil:'sensor.valve'},heizkreise:[{vorlauf:'sensor.vl',pumpe:'switch.hk'}]};
const hass=()=>({language:'de',states:{'sensor.wp':{state:'on',attributes:{}},'sensor.valve':{state:'100',attributes:{}},'switch.hk':{state:'on',attributes:{}}}});
const make=()=>{const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);c._hass=hass();return c;};
const layout=(x,y)=>({version:2,components:{wp:{x,y}}});
test('moved WP candidate requires connected text and paint measurement',()=>{
  const card=make(),before=JSON.stringify(card._model),legacy=card._render();
  const candidate=resolve(raw,card._cfg,layout(340,160));
  assert.equal(candidate.status,'heating-candidate',JSON.stringify(candidate.errors));
  assert.equal(candidate.model.components.wp.origin.x,340);
  assert.equal(candidate.model.components.wp.origin.y,160);
  assert.equal(candidate.model.junctions['supply-tee'].y,223);
  assert.equal(candidate.routes.length,11);
  assert.ok(candidate.routes.every(r=>r.status==='routed'));
  assert.equal(JSON.stringify(card._model),before,'candidate never mutates current model');
  const saved=card._model;card._model=candidate.model;
  const result=render(card,candidate.routes,candidate.policy);
  assert.equal(result.reason,'complete-card-text-shadow-paint-validation-required',JSON.stringify(result));
  assert.equal((result.html.match(/data-preview-route="/g)||[]).length,11);
  assert.equal((result.html.match(/data-preview-rail="/g)||[]).length,2);
  assert.ok(result.html.includes('transform="translate(10 10)"'));
  assert.ok(result.html.includes('class="wp"'),'real pump running state is rendered');
  card._hass.states['switch.hk'].state='off';
  const off=render(card,candidate.routes,candidate.policy);
  assert.equal(off.reason,'complete-card-text-shadow-paint-validation-required');
  assert.ok(!off.html.includes('class="wp"'));
  card._model=saved;card._hass=hass();
  const pending=prepare(card,raw,layout(340,160));
  assert.equal(pending.status,'unsupported');
  assert.equal(pending.errors[0].code,'text-measurement-unavailable');
  assert.equal(Object.hasOwn(pending,'html'),false);
  assert.equal(card._model,saved);assert.equal(card._render(),legacy);
  const publicResult=preflight(raw,layout(340,160),hass());
  assert.equal(publicResult.status,'unsupported');assert.equal(Object.hasOwn(publicResult,'html'),false);
});
test('unproven movement and malformed overrides fail closed',()=>{
  const card=make();
  for (const data of [layout(330,155),layout(0,160),{version:2,components:{wp:{x:340,y:160},valve:{x:0,y:0}}}]) {
    const result=prepare(card,raw,data);
    assert.ok(['unsupported','invalid'].includes(result.status));
    assert.equal(Object.hasOwn(result,'html'),false);
  }
});
