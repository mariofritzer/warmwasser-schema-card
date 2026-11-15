const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const registry=new Map();
const context={HTMLElement:class {},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.api={resolveLayoutCandidate,inspectMeasuredLayoutTexts,inspectLayoutShadowPolicy,inspectLayoutSymbolPaint,inspectLayoutPipePaint,inspectCompleteSimpleFmPaint,renderGeometry:(c,k)=>{c._model=k.model;layoutRenderRoutes.set(c,k);try{return c._render();}finally{layoutRenderRoutes.delete(c);}}};',context);
const {resolveLayoutCandidate:resolve,inspectMeasuredLayoutTexts:inspect,inspectLayoutShadowPolicy:shadow,inspectLayoutSymbolPaint:symbols,inspectLayoutPipePaint:pipes,inspectCompleteSimpleFmPaint:complete,renderGeometry}=context.api;
function fixture(full=false,type='schicht') {
  const raw={speicher:{typ:type,volumen:500},fm:{pumpe:'sensor.fm',...(full?{temp:'sensor.fmtemp',durchfluss:'sensor.flow'}:{})},
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
  flow.box={...temp.box,x:temp.box.x+temp.box.width+1.5};
  assert.equal(inspect(c,candidate,overlap).reason,'text-overlap','one-unit reserves touch');
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
test('shadow policy binds each rendered filter and exact model region but never approves paint',()=>{
  const {c,candidate}=fixture(),html=renderGeometry(c,candidate),result=shadow(c,candidate,html);
  assert.equal(result.status,'unsupported');assert.equal(result.reason,'layout-shadow-policy-bound-only');
  assert.equal(result.shadows.length,3);assert.equal(result.allowedOverlap,'decorative-shadow');
  const fm=result.shadows.find(s=>s.owner==='fm');
  assert.equal(fm.x,337);assert.equal(fm.y,2);assert.equal(fm.width,176);assert.equal(fm.height,144);
  assert.equal(shadow(c,candidate,html.replace('stdDeviation="4"','stdDeviation="5"')).reason,'layout-shadow-policy-unproven');
  assert.equal(shadow(c,candidate,html.replace('filter="url(#wwShadow)"','')).reason,'layout-shadow-policy-unproven');
  const invalid={...candidate,model:structuredClone(candidate.model)};invalid.model.components.fm.origin.x=Infinity;
  assert.equal(shadow(c,invalid,html).reason,'layout-shadow-policy-unproven');
});
test('visible droplet, rotating fan, LED and domestic arrows exclude text boxes',()=>{
  const {c,candidate,records}=fixture(),html=renderGeometry(c,candidate),result=symbols(c,candidate,records,html);
  assert.equal(result.reason,'layout-symbol-paint-bound-only');assert.equal(result.symbols.length,7);
  for(const icon of result.symbols) {
    const changed=records.map(r=>({...r,box:{...r.box}}));
    changed[0].box={x:icon.x,y:icon.y,width:1,height:1};
    assert.equal(symbols(c,candidate,changed,html).reason,'text-obstacle-contact',icon.id);
  }
  assert.equal(symbols(c,candidate,records,html.replace('M430 30C424','M430 31C424')).reason,'layout-symbol-paint-unproven');
});
test('baffle plate is inventoried and cannot cover a measured label',()=>{
  const {c,candidate,records}=fixture(false,'trennblech'),html=renderGeometry(c,candidate),result=symbols(c,candidate,records,html);
  assert.equal(result.reason,'layout-symbol-paint-bound-only');
  const baffle=result.symbols.find(s=>s.id==='tank-baffle');assert.ok(baffle);
  const changed=records.map(r=>({...r,box:{...r.box}}));changed[0].box={x:baffle.x,y:baffle.y,width:1,height:1};
  assert.equal(symbols(c,candidate,changed,html).reason,'text-obstacle-contact');
  assert.equal(symbols(c,candidate,records,html.replace('fill="url(#wwGrid)"','fill="none"')).reason,'layout-symbol-paint-unproven');
});
test('primary and domestic routes and every stub bind to the rendered batch',()=>{
  const {c,candidate}=fixture(),html=renderGeometry(c,candidate),result=pipes(c,candidate,html);
  assert.equal(result.reason,'layout-pipe-paint-bound-only');assert.equal(result.routes,9);assert.equal(result.stubs,13);
  const route=Object.values(candidate.routes)[0];
  assert.equal(pipes(c,candidate,html.replace(`d="${route.path}" class="w0"`,'d="M0 0" class="w0"')).reason,'layout-pipe-paint-unproven');
  assert.equal(pipes(c,candidate,html.replace(`d="${route.path}" class="w0"`,`d="${route.path}" class="w0" transform="translate(50)"`)).reason,'layout-pipe-paint-unproven');
  assert.equal(pipes(c,candidate,html.replace('class="wk"','class="missing"')).reason,'layout-pipe-paint-unproven');
  let moved=html,late='';
  for(const layer of ['w1','w2']) {
    const start=moved.indexOf(`<path d="${route.path}" class="${layer}"`),end=moved.indexOf('/>',start)+2;
    assert.ok(start>=0 && end>start);late+=moved.slice(start,end);moved=moved.slice(0,start)+moved.slice(end);
  }
  moved=moved.replace('</svg>',`${late}</svg>`);
  assert.equal(pipes(c,candidate,moved).reason,'layout-pipe-paint-unproven');
  assert.equal(pipes(c,candidate,html.replace('</svg>','<path d="M0 0H999" class="w3"/></svg>')).reason,'layout-pipe-paint-unproven');
  assert.equal(pipes(c,candidate,html.replace('</svg>','<path d="M0 0H999" class="w0 wx"/></svg>')).reason,'layout-pipe-paint-unproven');
  assert.equal(pipes(c,candidate,html.replace('</svg>','<rect x="0" y="0" width="2" height="2" class="wk wx"/></svg>')).reason,'layout-pipe-paint-unproven');
  c._hass.states['sensor.fm'].state='off';
  assert.equal(pipes(c,candidate,html).reason,'layout-pipe-paint-unproven');
  c._hass.states['sensor.fm'].state='on';
  const forged={...candidate,routes:{...candidate.routes}},id=Object.keys(forged.routes)[0];
  forged.routes[id]={...forged.routes[id],path:'M0 0'};
  assert.equal(pipes(c,forged,html).reason,'layout-pipe-paint-unproven');
});
test('simple FM-only complete inventory classifies every visible shape',()=>{
  const raw={speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'}},c=new (registry.get('warmwasser-schema-card'))();
  c.setConfig(raw);c._hass={language:'en',states:{'sensor.fm':{state:'on'}}};
  const candidate=resolve(raw,c._cfg,{version:2,components:{fm:{x:370,y:29}}}),html=renderGeometry(c,candidate);
  const body=html.slice(html.indexOf('</defs>')+7,html.indexOf('</svg>')),matrix={a:1,b:0,c:0,d:1,e:0,f:0},shapes=[];
  for(const match of body.matchAll(/<(path|rect|circle|line)\b([^>]*)\/?\s*>/g)) {
    const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
    shapes.push({localName:match[1],getAttribute:name=>attrs[name]??null,closest:()=>null,
      getScreenCTM:()=>attrs.d?.startsWith('M430 30C424')?{...matrix,e:30,f:15}:matrix});
  }
  const svg={isConnected:true,getScreenCTM:()=>matrix,querySelectorAll:()=>shapes};
  assert.equal(complete(c,candidate,svg).status,'complete');
  shapes.push({localName:'circle',getAttribute:()=>null,closest:()=>null});
  assert.equal(complete(c,candidate,svg).status,'unsupported');
});
test('FM display and volume variants keep a complete, model-bound shape inventory',()=>{
  for(const [temp,flow,volume] of [[true,false,500],[false,true,500],[true,true,500],[true,true,null]]) {
    const raw={speicher:{typ:'schicht',...(volume===null?{}:{volumen:volume})},
      fm:{pumpe:'sensor.fm',...(temp?{temp:'sensor.temp'}:{}),...(flow?{durchfluss:'sensor.flow'}:{})}};
    const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
    c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.temp':{state:'42'},'sensor.flow':{state:'3'}}};
    const candidate=resolve(raw,c._cfg,{version:2,components:{fm:{x:370,y:29}}}),html=renderGeometry(c,candidate);
    const body=html.slice(html.indexOf('</defs>')+7,html.indexOf('</svg>')),matrix={a:1,b:0,c:0,d:1,e:0,f:0},shapes=[];
    for(const match of body.matchAll(/<(path|rect|circle|line)\b([^>]*)\/?\s*>/g)) {
      const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
      const moved=attrs.d?.startsWith('M430 22C426') || (attrs.x==='392' && attrs.y==='62' && attrs.width==='52' && attrs.height==='34');
      shapes.push({localName:match[1],getAttribute:name=>attrs[name]??null,closest:()=>null,getScreenCTM:()=>moved?{...matrix,e:30,f:15}:matrix});
    }
    const svg={isConnected:true,getScreenCTM:()=>matrix,querySelectorAll:()=>shapes};
    assert.equal(complete(c,candidate,svg).status,'complete',`${temp}/${flow}/${volume}`);
    const display=shapes.find(el=>el.localName==='rect' && el.getAttribute('x')==='392' && el.getAttribute('y')==='62');
    const get=display.getAttribute;display.getAttribute=name=>name==='rx'?'50':get(name);
    assert.equal(complete(c,candidate,svg).status,'unsupported');
  }
});
test('FM volume and live values require exact inventory, slots and current HA state',()=>{
  const raw={speicher:{typ:'schicht',volumen:500},fm:{pumpe:'sensor.fm',temp:'sensor.temp',durchfluss:'sensor.flow'}},
    c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
  c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.temp':{state:'42'},'sensor.flow':{state:'3'}}};
  const candidate=resolve(raw,c._cfg,{version:2,components:{fm:{x:370,y:29}}}),html=renderGeometry(c,candidate),records=[];
  for(const match of html.matchAll(/<text\s+([^>]*)>([^<]*)<\/text>/g)) {
    const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
    const x=Number(attrs.x),y=Number(attrs.y),moved=x===352 || x===418,dx=moved?30:0,dy=moved?15:0,
      center=(attrs.class||'').split(' ').includes('wc'),end=(attrs.class||'').split(' ').includes('we');
    records.push({text:match[2],x:attrs.x,y:attrs.y,className:attrs.class??null,matrix:{a:1,b:0,c:0,d:1,e:dx,f:dy},
      box:{x:x+dx-(center?1:end?2:0),y:y+dy-5,width:2,height:4}});
  }
  assert.equal(inspect(c,candidate,records).reason,'text-inventory-staged-only');
  for(const text of ['500 l','42.0°','3 l/min']) assert.ok(records.some(record=>record.text===text),text);
  const overflow=records.map(r=>({...r,box:{...r.box}}));overflow.find(r=>r.text==='42.0°').box.width=100;
  assert.equal(inspect(c,candidate,overflow).reason,'text-slot-overflow');
  c._hass.states['sensor.temp'].state='43';assert.equal(inspect(c,candidate,records).reason,'text-inventory-unproven');
  assert.equal(complete({...c,_cfg:{...c._cfg,wp:{betrieb:'sensor.wp'}}},candidate,{isConnected:true}).status,'unsupported');
  assert.equal(complete({...c,_cfg:{...c._cfg,typ:'trennblech'}},candidate,{isConnected:true}).status,'unsupported');
});
