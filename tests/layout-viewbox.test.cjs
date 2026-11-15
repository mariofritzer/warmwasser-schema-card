const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const registry=new Map();
const context={HTMLElement:class{},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+'\nglobalThis.resolve=resolveLayoutCandidate; globalThis.preflight=preflightLayoutRender;'+require('./helpers/internal-layout-gate.cjs'),context);
const Card=registry.get('warmwasser-schema-card');
for (const type of ['schicht','trennblech']) for (const wp of [false,true]) for (const [x,y] of [[-450,-400],[900,-400]]) {
  test(`${type} ${wp?'with':'without'} WP includes every routed pipe at FM ${x},${y}`,()=>{
    const raw={speicher:{typ:type},fm:{pumpe:'sensor.fm'},...(wp?{wp:{typ:'luft',betrieb:'sensor.wp'}}:{})};
    const card=new Card(); card.setConfig(raw);
    const layout={version:2,components:{fm:{x,y}}}, candidate=context.resolve(raw,card._cfg,layout);
    const result=context.preflight(raw,layout,{language:'de',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:'on'}}});
    assert.equal(candidate.status,'candidate',JSON.stringify(candidate.errors));
    assert.equal(result.status,'rendered-candidate',JSON.stringify(result.errors));
    const [,vx,vy,vw,vh]=result.html.match(/viewBox="([^ ]+) ([^ ]+) ([^ ]+) ([^"]+)"/).map(Number);
    for (const route of Object.values(candidate.routes)) {
      assert.equal(route.status,'routed'); assert.ok(result.html.includes(`d="${route.path}"`));
      for (const p of route.points) {
        assert.ok(p.x-16>=vx && p.x+16<=vx+vw,`x ${p.x} outside ${vx}..${vx+vw}`);
        assert.ok(p.y-16>=vy && p.y+16<=vy+vh,`y ${p.y} outside ${vy}..${vy+vh}`);
      }
    }
  });
}

test('layout preflight does not alter the canonical rendering or its viewBox',()=>{
  const raw={speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'}}, c=new Card(); c.setConfig(raw);
  c._hass={language:'de',states:{'sensor.fm':{state:'on'}}};
  const before=c._render();
  assert.equal(context.preflight(raw,{version:2,components:{fm:{x:-450,y:-400}}},c._hass).status,'rendered-candidate');
  assert.equal(c._render(),before);
});
