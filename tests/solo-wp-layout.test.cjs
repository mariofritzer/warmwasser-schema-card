const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const registry=new Map(),ctx={HTMLElement:class{},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+'\nglobalThis.resolve=resolveLayoutCandidate;globalThis.proof=inspectLayoutPipePaint;globalThis.texts=inspectMeasuredLayoutTexts;globalThis.render=(card,candidate)=>{const old=card._model;try{card._model=candidate.model;layoutRenderRoutes.set(card,candidate);return card._render()}finally{layoutRenderRoutes.delete(card);card._model=old}};',ctx);
const Card=registry.get('warmwasser-schema-card');
for(const typ of ['schicht','trennblech'])test(`${typ} standalone WP renders all five validated routes`,()=>{
 const raw={speicher:{typ},wp:{betrieb:'sensor.wp'}},card=new Card();card.setConfig(raw);card._hass={language:'en',states:{'sensor.wp':{state:'on'}}};
 const old=JSON.stringify(card._model),candidate=ctx.resolve(raw,card._cfg,{version:2,components:{wp:{x:360,y:165}}});
 assert.equal(candidate.status,'candidate',JSON.stringify(candidate.errors));assert.equal(Object.keys(candidate.routes).length,5);
 assert.equal(JSON.stringify(card._model),old);const html=ctx.render(card,candidate);
 for(const r of Object.values(candidate.routes))for(const layer of ['w0','w1','w2'])assert.ok(html.includes(`<path d="${r.path}" class="${layer}"`));
 assert.equal(ctx.proof(card,candidate,html).reason,'layout-pipe-paint-bound-only');
 candidate.routes['wp-upper-supply'].path+='L0 0';assert.equal(ctx.proof(card,candidate,html).reason,'layout-pipe-paint-unproven');
});
test('standalone WP rejects unsupported equipment, ports and collisions',()=>{
 for(const extra of [{wp:{typ:'sole',betrieb:'sensor.wp'}},{speicher:{typ:'getrennt'}},{heizstab_oben:{stufe:'sensor.step'}},{wp:{betrieb:'sensor.wp',wmz:'sensor.meter'}}]) {
  const raw={speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp'},...extra},card=new Card();card.setConfig(raw);
  assert.equal(ctx.resolve(raw,card._cfg,{version:2,components:{wp:{x:360,y:165}}}).status,'unsupported');
 }
 const raw={speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp'}},card=new Card();card.setConfig(raw);
 assert.equal(ctx.resolve(raw,card._cfg,{version:2,components:{wp:{x:100,y:100}}}).errors[0].code,'body-collision');
 assert.equal(ctx.resolve(raw,card._cfg,{version:2,ports:{'wp.upper-supply':{mode:'manual',side:'left'}}}).status,'invalid');
});

test('standalone WP with sensors checks the complete batch and rejects overlapping labels',()=>{
 const raw={speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp'},fuehler:[{name:'Top',entity:'sensor.top',hoehe:10},{name:'Bottom',entity:'sensor.bottom',hoehe:90}]},card=new Card();card.setConfig(raw);
 const result=ctx.resolve(raw,card._cfg,{version:2,components:{wp:{x:330,y:165}}});assert.equal(result.status,'candidate',JSON.stringify(result.errors));
 const overlap={...raw,fuehler:[raw.fuehler[0],{...raw.fuehler[1],hoehe:11}]},other=new Card();other.setConfig(overlap);
 assert.equal(ctx.resolve(overlap,other._cfg,{version:2,components:{wp:{x:330,y:165}}}).status,'unsupported');
});

test('standalone WP inventory measures live labels and rejects stale or overflowing text',()=>{
 const raw={speicher:{typ:'schicht'},wp:{betrieb:'sensor.wp',leistung:'sensor.power',cop:'sensor.cop',vorlauf:'sensor.vl',ruecklauf:'sensor.rl',sg_ready:'sensor.sg'}},card=new Card();card.setConfig(raw);
 card._hass={language:'en',states:{'sensor.wp':{state:'on'},'sensor.power':{state:'1200'},'sensor.cop':{state:'3.2'},'sensor.vl':{state:'40'},'sensor.rl':{state:'35'},'sensor.sg':{state:'2'}}};
 const candidate=ctx.resolve(raw,card._cfg,{version:2,components:{wp:{x:360,y:165}}}),html=ctx.render(card,candidate),records=[];
 for(const match of html.matchAll(/<text\s+([^>]*)>([^<]*)<\/text>/g)) {
  const a=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])),x=Number(a.x),y=Number(a.y),wp=[342,390,424,438].includes(x);
  const dx=wp?30:0,dy=wp?15:0;records.push({text:match[2],x:a.x,y:a.y,className:a.class??null,matrix:{a:1,b:0,c:0,d:1,e:dx,f:dy},box:{x:x+dx-1,y:y+dy-5,width:2,height:4}});
 }
 assert.equal(ctx.texts(card,candidate,records).reason,'text-inventory-staged-only',JSON.stringify(ctx.texts(card,candidate,records)));
 const altered=records.map(r=>({...r,box:{...r.box}}));altered.find(r=>r.text==='SG 2').box.width=200;
 assert.equal(ctx.texts(card,candidate,altered).reason,'text-slot-overflow');
 card._hass.states['sensor.sg'].state='3';assert.equal(ctx.texts(card,candidate,records).reason,'text-inventory-unproven');
});
