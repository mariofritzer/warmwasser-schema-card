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
  assert.equal(inspect(c,candidate,overlap).reason,'text-inventory-staged-only','more than one unit separates the text');
  flow.box={...temp.box,x:temp.box.x+temp.box.width+.75};
  assert.equal(inspect(c,candidate,overlap).reason,'text-overlap','less than one unit separates the text');
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
  for(const type of ['schicht','trennblech']) for(const [temp,flow,volume] of [[true,false,500],[false,true,500],[true,true,500],[true,true,null]]) {
    const raw={speicher:{typ:type,...(volume===null?{}:{volumen:volume})},
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
    assert.equal(complete(c,candidate,svg).status,'complete',`${type}/${temp}/${flow}/${volume}`);
    if (type==='trennblech') {
      const plate=shapes.find(el=>el.localName==='rect' && el.getAttribute('fill')==='url(#wwGrid)');
      const original=plate.getAttribute; plate.getAttribute=name=>name==='fill'?'none':original(name);
      assert.equal(complete(c,candidate,svg).status,'unsupported'); plate.getAttribute=original;
    }
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
test('air WP fan and valve inventory follows live valve state and rejects changed geometry',()=>{
  for(const type of ['schicht','trennblech']) for(const [valveState,wpState,defrost] of [[null,'on',false],['unknown','unknown',false],['on','off',false],['off','unavailable',false],['50','on',true]]) {
    const raw={speicher:{typ:type,volumen:500},fm:{pumpe:'sensor.fm',temp:'sensor.temp',durchfluss:'sensor.flow'},
      wp:{betrieb:'sensor.wp',leistung:'sensor.power',cop:'sensor.cop',vorlauf:'sensor.vl',ruecklauf:'sensor.rl',...(defrost?{abtauen:'sensor.defrost'}:{}),...(valveState===null?{}:{ventil:'sensor.valve'})}};
    const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
    c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:wpState},'sensor.defrost':{state:'on'},'sensor.temp':{state:'42'},'sensor.flow':{state:'3'},
      'sensor.power':{state:'1200'},'sensor.cop':{state:'3.2'},'sensor.vl':{state:'40'},'sensor.rl':{state:'35'},'sensor.valve':{state:valveState}}};
    const movedWp=valveState==='50',candidate=resolve(raw,c._cfg,{version:2,components:{fm:{x:370,y:29},...(movedWp?{wp:{x:360,y:165}}:{})}});assert.equal(candidate.status,'candidate');
    const html=renderGeometry(c,candidate),body=html.slice(html.indexOf('</defs>')+7,html.indexOf('</svg>')),
      matrix={a:1,b:0,c:0,d:1,e:0,f:0},shapes=[];
    const fanMarkup=body.match(/<g\b([^>]*)><path d="M390 226Q405 213 397 192Q383 203 390 226Z"/);
    assert.ok(fanMarkup,'rendered fan group');
    assert.equal(/class="wr"/.test(fanMarkup[1]),wpState==='on'||defrost);
    assert.equal(/style="animation-duration:4s"/.test(fanMarkup[1]),defrost);
    const svg={isConnected:true,getScreenCTM:()=>matrix,querySelectorAll:()=>shapes};
    const fanParent=movedWp?{getScreenCTM:()=>({...matrix,e:30,f:15})}:svg;
    const fan={localName:'g',parentElement:fanParent,getAttribute:name=>name==='class'?(wpState==='on'||defrost?'wr':null):name==='style'&&defrost?'animation-duration:4s':null};
    for(const match of body.matchAll(/<(path|rect|circle|line)\b([^>]*)\/?\s*>/g)) {
      const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
      const moved=attrs.d?.startsWith('M430 22C426') || (attrs.x==='392' && attrs.y==='62' && attrs.width==='52' && attrs.height==='34') ||
        (movedWp && ((match[1]==='circle' && attrs.r!=='2.5') || (attrs.x==='342' && attrs.y==='282' && attrs.width==='96')));
      shapes.push({localName:match[1],attrs,parentElement:attrs.d==='M390 226Q405 213 397 192Q383 203 390 226Z'?fan:svg,
        getAttribute:name=>attrs[name]??null,closest:()=>null,getScreenCTM:()=>moved?{...matrix,e:30,f:15}:matrix});
    }
    assert.equal(complete(c,candidate,svg).status,'complete',`valve ${valveState}, WP ${wpState}, defrost ${defrost}`);
    if(movedWp) {
      fanParent.getScreenCTM=()=>({...matrix,e:31,f:15});
      assert.equal(complete(c,candidate,svg).status,'unsupported','fan translation must match model');
      fanParent.getScreenCTM=()=>({...matrix,e:30,f:15});
    }
    const blade=shapes.find(el=>el.attrs.transform==='rotate(72 390 226)');blade.attrs.transform='rotate(73 390 226)';
    assert.equal(complete(c,candidate,svg).status,'unsupported');blade.attrs.transform='rotate(72 390 226)';
    shapes.push({localName:'circle',getAttribute:()=>null,closest:()=>null});assert.equal(complete(c,candidate,svg).status,'unsupported');
  }
});
test('separated tanks bind both measured labels, shadows, contours and complete primary routes',()=>{
  const raw={speicher:{typ:'getrennt',volumen:500,volumen_ww:200},fm:{pumpe:'sensor.fm'},wp:{betrieb:'sensor.wp',ventil:'sensor.valve'}};
  const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
  c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:'on'},'sensor.valve':{state:'on'}}};
  const candidate=resolve(raw,c._cfg,{version:2,components:{fm:{x:-110,y:14}},ports:{'tank.fm-supply':{mode:'auto'},'fm.supply':{mode:'auto'}}});
  assert.equal(candidate.status,'candidate',JSON.stringify(candidate.errors));
  const html=renderGeometry(c,candidate),records=[];
  for(const match of html.matchAll(/<text\s+([^>]*)>([^<]*)<\/text>/g)) {
    const a=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    const x=Number(a.x),y=Number(a.y),dx=x===352||x===418?-450:0;
    records.push({text:match[2],x:a.x,y:a.y,className:a.class??null,matrix:{a:1,b:0,c:0,d:1,e:dx,f:0},box:{x:x+dx-1,y:y-5,width:2,height:4}});
  }
  assert.equal(inspect(c,candidate,records).reason,'text-inventory-staged-only');
  assert.equal(shadow(c,candidate,html).reason,'layout-shadow-policy-bound-only');
  assert.equal(symbols(c,candidate,records,html).reason,'layout-symbol-paint-bound-only');
  assert.equal(pipes(c,candidate,html).reason,'layout-pipe-paint-bound-only');
  const realLabel=records.map(r=>({...r,box:{...r.box}}));
  realLabel.find(r=>r.x==='137'&&r.y==='38').box={x:85.45336,y:29.62047,width:103.09326,height:12.00604};
  assert.equal(inspect(c,candidate,realLabel).reason,'text-inventory-staged-only');
  assert.equal(symbols(c,candidate,realLabel,html).reason,'layout-symbol-paint-bound-only');
  realLabel.find(r=>r.x==='137'&&r.y==='38').box.y+=1;
  assert.equal(symbols(c,candidate,realLabel,html).reason,'text-obstacle-contact');
  const matrix={a:1,b:0,c:0,d:1,e:0,f:0},shapes=[],svg={isConnected:true,getScreenCTM:()=>matrix,querySelectorAll:()=>shapes};
  const fan={localName:'g',parentElement:svg,getAttribute:name=>name==='class'?'wr':null};
  for(const match of html.slice(html.indexOf('</defs>')+7,html.indexOf('</svg>')).matchAll(/<(path|rect|circle|line)\b([^>]*)\/?\s*>/g)) {
    const a=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
    const moved=a.d?.startsWith('M430 30C424');
    shapes.push({localName:match[1],attrs:a,parentElement:a.d==='M390 226Q405 213 397 192Q383 203 390 226Z'?fan:svg,
      getAttribute:name=>a[name]??null,closest:()=>null,getScreenCTM:()=>moved?{...matrix,e:-450}:matrix});
  }
  assert.equal(complete(c,candidate,svg).status,'complete');
  const contour=shapes.find(el=>el.attrs.d?.startsWith('M72 40Q'));const original=contour.attrs.d;contour.attrs.d='M0 0H999';
  assert.equal(complete(c,candidate,svg).status,'unsupported');contour.attrs.d=original;
  const bad=records.map(r=>({...r,box:{...r.box}}));bad.find(r=>r.x==='137'&&r.y==='38').box.width=150;
  assert.equal(inspect(c,candidate,bad).reason,'text-slot-overflow');
});
test('separated buffer feet follow the exact model translation and reject forged CTMs',()=>{
  const raw={speicher:{typ:'getrennt'},fm:{pumpe:'sensor.fm'},wp:{betrieb:'sensor.wp',ventil:'sensor.valve'}};
  const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
  c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:'on'},'sensor.valve':{state:'on'}}};
  const candidate=resolve(raw,c._cfg,{version:2,components:{fm:{x:-110,y:14},buffer:{x:42,y:218}},
    ports:{'tank.fm-supply':{mode:'auto'},'fm.supply':{mode:'auto'}}});
  assert.equal(candidate.status,'candidate',JSON.stringify(candidate.errors));
  const html=renderGeometry(c,candidate),matrix={a:1,b:0,c:0,d:1,e:0,f:0},shapes=[],svg={isConnected:true,getScreenCTM:()=>matrix,querySelectorAll:()=>shapes};
  const fan={localName:'g',parentElement:svg,getAttribute:name=>name==='class'?'wr':null};
  for(const match of html.slice(html.indexOf('</defs>')+7,html.indexOf('</svg>')).matchAll(/<(path|rect|circle|line)\b([^>]*)\/?\s*>/g)) {
    const a=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
    const foot=match[1]==='rect' && (a.x==='93'||a.x==='170') && a.y==='362' && a.width==='11' && a.height==='22';
    const moved=a.d?.startsWith('M430 30C424');
    shapes.push({localName:match[1],attrs:a,foot,parentElement:a.d==='M390 226Q405 213 397 192Q383 203 390 226Z'?fan:svg,
      getAttribute:name=>a[name]??null,closest:()=>null,getScreenCTM:()=>foot?{...matrix,e:-30,f:15}:moved?{...matrix,e:-450}:matrix});
  }
  assert.equal(complete(c,candidate,svg).status,'complete');
  const foot=shapes.find(s=>s.foot);foot.getScreenCTM=()=>matrix;
  assert.equal(complete(c,candidate,svg).status,'unsupported');
});

test('separated rotated valve paint requires the exact model transform for every symbol shape',()=>{
  for(const [angle,dx,dy,side] of [[90,0,0,'right'],[180,0,100,'left'],[270,-150,200,'left']]) {
    const raw={speicher:{typ:'getrennt'},fm:{pumpe:'sensor.fm'},wp:{betrieb:'sensor.wp',ventil:'sensor.valve'}};
    const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
    c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:'on'},'sensor.valve':{state:'50'}}};
    const v=c._model.components.valve;
    const candidate=resolve(raw,c._cfg,{version:2,components:{fm:{x:400,y:29},valve:{x:v.origin.x+dx,y:v.origin.y+dy,rotation:angle}},ports:{'tank.wp-supply':{mode:'manual',side}}});
    assert.equal(candidate.status,'candidate',JSON.stringify(candidate.errors));
    const html=renderGeometry(c,candidate),matrix={a:1,b:0,c:0,d:1,e:0,f:0},shapes=[],svg={isConnected:true,getScreenCTM:()=>matrix,querySelectorAll:()=>shapes};
    const fan={localName:'g',parentElement:svg,getAttribute:name=>name==='class'?'wr':null};
    const q=candidate.model.components.valve,vx=q.origin.x+34,vy=q.origin.y+14;
    const [a,b,cc,d]=({90:[0,1,-1,0],180:[-1,0,0,-1],270:[0,-1,1,0]})[angle];
    const rotated={a,b,c:cc,d,e:vx-a*vx-cc*vy,f:vy-b*vx-d*vy};
    for(const match of html.slice(html.indexOf('</defs>')+7,html.indexOf('</svg>')).matchAll(/<(path|rect|circle|line)\b([^>]*)\/?\s*>/g)) {
      const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
      const valve=attrs.class==='wm' || match[1]==='line' || (match[1]==='circle' && attrs.cx===String(vx) && attrs.cy===String(vy) && attrs.r==='2.5') || (match[1]==='path' && attrs.d?.startsWith(`M${vx-9} ${vy-14}H${vx+9}L${vx} ${vy}Z`)) || (match[1]==='path' && attrs.d===`M${vx+15} ${vy-9}V${vy+9}L${vx} ${vy}Z`);
      const moved=attrs.d?.startsWith('M430 30C424');
      shapes.push({localName:match[1],attrs,valve,parentElement:attrs.d==='M390 226Q405 213 397 192Q383 203 390 226Z'?fan:svg,getAttribute:name=>attrs[name]??null,closest:()=>null,getScreenCTM:()=>valve?rotated:moved?{...matrix,e:60,f:15}:matrix});
    }
    assert.equal(complete(c,candidate,svg).status,'complete',String(angle));
    for(const shape of shapes.filter(s=>s.valve)) {const previous=shape.getScreenCTM;shape.getScreenCTM=()=>matrix;assert.equal(complete(c,candidate,svg).status,'unsupported',`${angle}: ${shape.localName}`);shape.getScreenCTM=previous;}
  }
});

test('rotated valve text stays upright inside the rotated motor and rejects tampering',()=>{
  for(const [angle,dx,dy,side] of [[90,0,0,'right'],[180,0,100,'left'],[270,-150,200,'left']]) {
    const raw={speicher:{typ:'getrennt'},fm:{pumpe:'sensor.fm'},wp:{betrieb:'sensor.wp',ventil:'sensor.valve'}};
    const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
    c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:'on'},'sensor.valve':{state:'50'}}};
    const v=c._model.components.valve,candidate=resolve(raw,c._cfg,{version:2,components:{fm:{x:400,y:29},valve:{x:v.origin.x+dx,y:v.origin.y+dy,rotation:angle}},ports:{'tank.wp-supply':{mode:'manual',side}}});
    assert.equal(candidate.status,'candidate',JSON.stringify(candidate.errors));
    const html=renderGeometry(c,candidate),q=candidate.model.components.valve,vx=q.origin.x+34,vy=q.origin.y+14,mx=vx-26;
    const [a,b,cc,d]=({90:[0,1,-1,0],180:[-1,0,0,-1],270:[0,-1,1,0]})[angle],tx=vx+a*(mx-vx)-mx,ty=vy+b*(mx-vx)-vy;
    const records=[];
    for(const match of html.matchAll(/<text\s+([^>]*)>([^<]*)<\/text>/g)) {
      const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
      const x=Number(attrs.x),y=Number(attrs.y),motor=match[2]==='M',fm=x===352||x===418;
      const ex=motor?tx:fm?60:0,ey=motor?ty:fm?15:0;
      records.push({text:match[2],x:attrs.x,y:attrs.y,className:attrs.class??null,matrix:{a:1,b:0,c:0,d:1,e:ex,f:ey},box:{x:x+ex-1,y:y+ey-5,width:2,height:4}});
    }
    assert.equal(inspect(c,candidate,records).reason,'text-inventory-staged-only',`${angle}: ${JSON.stringify(inspect(c,candidate,records))}`);
    const changed=records.map(r=>({...r,matrix:{...r.matrix},box:{...r.box}})),motor=changed.find(r=>r.text==='M');
    motor.matrix.b=1;assert.equal(inspect(c,candidate,changed).reason,'text-inventory-unproven');motor.matrix.b=0;
    motor.matrix.e+=1;assert.equal(inspect(c,candidate,changed).reason,'text-inventory-unproven');motor.matrix.e-=1;
    motor.box.width=100;assert.equal(inspect(c,candidate,changed).reason,'text-slot-overflow');
  }
});
