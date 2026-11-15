const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const registry=new Map();
const context={HTMLElement:class {},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.api={resolveLayoutCandidate,inspectMeasuredLayoutTexts,renderGeometry:(c,k)=>{c._model=k.model;layoutRenderRoutes.set(c,k);try{return c._render();}finally{layoutRenderRoutes.delete(c);}}};',context);
const {resolveLayoutCandidate:resolve,inspectMeasuredLayoutTexts:inspect,renderGeometry}=context.api;
function fixture(full=false) {
  const raw={speicher:{typ:'schicht',volumen:500},fm:{pumpe:'sensor.fm',...(full?{temp:'sensor.fmtemp',durchfluss:'sensor.flow'}:{})},
    wp:{betrieb:'sensor.wp',...(full?{leistung:'sensor.power',cop:'sensor.cop',vorlauf:'sensor.vl',ruecklauf:'sensor.rl'}:{})},
    ...(full?{text_tw_kalt:'Cold',text_tw_warm:'Hot'}:{})};
  const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
  c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:'on'},'sensor.fmtemp':{state:'40'},
    'sensor.flow':{state:'4'},'sensor.power':{state:'1200'},'sensor.cop':{state:'3.2'},'sensor.vl':{state:'40'},'sensor.rl':{state:'35'}}};
  const candidate=resolve(raw,c._cfg,{version:2,components:{fm:{x:370,y:29}}});
  assert.equal(candidate.status,'candidate');
  const html=renderGeometry(c,candidate),records=[];
  for(const match of html.matchAll(/<text\s+([^>]*)>([^<]*)<\/text>/g)) {
    const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    const x=Number(attrs.x),y=Number(attrs.y),fm=x===352 || x===418;
    const dx=fm?30:0,dy=fm?15:0,center=(attrs.class||'').split(' ').includes('wc'),end=(attrs.class||'').split(' ').includes('we');
    records.push({text:match[2],x:attrs.x,y:attrs.y,className:attrs.class??null,matrix:{a:1,b:0,c:0,d:1,e:dx,f:dy},
      box:{x:x+dx-(center?1:end?2:0),y:y+dy-5,width:2,height:4}});
  }
  return {c,candidate,records};
}
test('model-bound FM/WP inventory remains partial and rejects missing or extra text',()=>{
  const {c,candidate,records}=fixture();
  assert.equal(inspect(c,candidate,records).reason,'text-inventory-staged-only',JSON.stringify({records,components:candidate.model.components}));
  assert.equal(inspect(c,candidate,records.slice(1)).reason,'text-inventory-unproven');
  assert.equal(inspect(c,candidate,[...records,{...records[0]}]).reason,'text-inventory-unproven');
  const changed=records.map(r=>({...r}));changed[0].text+=' forged';
  assert.equal(inspect(c,candidate,changed).reason,'text-inventory-unproven');
});
test('model slots and live status cannot overflow or collide silently',()=>{
  const {c,candidate,records}=fixture();
  const over=records.map(r=>({...r,box:{...r.box}}));over.find(r=>r.text===c._cfg.name_fm).box.width=200;
  assert.equal(inspect(c,candidate,over).reason,'text-slot-overflow');
  c._hass.states['sensor.wp'].state='off';
  assert.equal(inspect(c,candidate,records).reason,'text-inventory-unproven');
});
test('live FM/WP values and custom domestic labels are individually inventoried',()=>{
  const {c,candidate,records}=fixture(true);
  assert.equal(inspect(c,candidate,records).reason,'text-inventory-staged-only');
  for(const needle of ['COP 3.2','1.20 kW','VL 40.0° · RL 35.0°','Cold','Hot'])
    assert.ok(records.some(r=>r.text===needle),needle);
  c._hass.states['sensor.cop'].state='5';
  assert.equal(inspect(c,candidate,records).reason,'text-inventory-unproven');
});
test('overlap and pipe, corner and bridge envelopes reject measured labels',()=>{
  const {c,candidate,records}=fixture(true);
  const overlap=records.map(r=>({...r,box:{...r.box}}));
  const temp=overlap.find(r=>r.x==='418' && r.className==='wc wt'),flow=overlap.find(r=>r.x==='418' && r.className==='wc');
  flow.box={...temp.box};
  assert.equal(inspect(c,candidate,overlap).reason,'text-overlap');
  for(const shape of ['pipe','corner','bridge']) {
    const copy={...candidate,routes:{...candidate.routes}},key=Object.keys(copy.routes)[0];
    const route={...copy.routes[key],points:[{x:10,y:10},{x:20,y:10}],crossings:[]};
    if(shape==='pipe') route.points=[{x:380,y:42},{x:386,y:42}];
    if(shape==='corner') route.points=[{x:340,y:35},{x:370,y:35},{x:370,y:10}];
    if(shape==='bridge') route.crossings=[{bridge:true,point:{x:373,y:36}}];
    copy.routes[key]=route;
    assert.equal(inspect(c,copy,records).reason,'text-obstacle-contact',shape);
  }
});
test('foreign body and connector stub envelopes reject measured labels',()=>{
  const {c,candidate,records}=fixture();
  const body={...candidate,model:structuredClone(candidate.model)},shifted=records.map(r=>({...r,box:{...r.box},matrix:{...r.matrix}}));
  body.model.components.wp.origin={x:360,y:0};
  for(const r of shifted) if(['342','390','438'].includes(r.x)) {
    r.matrix.e=30;r.matrix.f=-150;r.box.x+=30;r.box.y-=150;
  }
  assert.equal(inspect(c,body,shifted).reason,'text-obstacle-contact');
  const stub={...candidate,model:structuredClone(candidate.model)};
  stub.model.components.wp.ports.return.stub={x:50,y:-108,width:12,height:12};
  assert.equal(inspect(c,stub,records).reason,'text-obstacle-contact');
});
