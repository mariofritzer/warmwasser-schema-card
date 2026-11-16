const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const registry=new Map(),context={HTMLElement:class{},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+'\nglobalThis.inspect=inspectTankHeaterGeometry;globalThis.shapes=inspectTankHeaterSvgShapes;globalThis.texts=inspectTankHeaterMeasuredTexts;globalThis.clearance=inspectTankHeaterTextClearance;globalThis.shapeClearance=inspectTankHeaterShapeClearance;globalThis.routeProbe=prepareInternalHeaterRouteCandidate;globalThis.complete=inspectCompleteSimpleFmPaint;globalThis.renderHeaterProbe=(card)=>{const c=card._cfg,m=card._model,{S,NUM}=sensorReader(card._hass),L=T[sprache(c,card._hass)],{hso,hsu}=heaterState(c,L,S,NUM),openComponent=id=>{const b=m.components[id],dx=b.origin.x-b.baseOrigin.x,dy=b.origin.y-b.baseOrigin.y;return dx||dy?`<g transform="translate(${dx} ${dy})">`:``},closeComponent=id=>{const b=m.components[id];return b.origin.x!==b.baseOrigin.x||b.origin.y!==b.baseOrigin.y?`</g>`:``};return renderHeaters({hso,hsu,geo:m.geometry,y_ru:m.geometry.ru,y_bu:m.geometry.bu,openComponent,closeComponent,F:c.farben,c,more:()=>"",S})};',context);
const Card=registry.get('warmwasser-schema-card');
const gradient=c=>({localName:'radialGradient',querySelectorAll:()=>['0','1'].map((offset,i)=>({getAttribute:name=>({offset,'stop-color':c._cfg.farben.aktiv,'stop-opacity':i?'0':'.75'})[name]??null}))});
function fixture(type='schicht') {
  const c=new Card();c.setConfig({speicher:{typ:type},fm:{pumpe:'sensor.fm'},hs_stufen:4,heizstab_oben:{stufe:'sensor.upper'},heizstab_unten:{leistung:'sensor.lower'}});
  c._hass={language:'en',states:{'sensor.upper':{state:'2'},'sensor.lower':{state:'0'}}};
  return c;
}
test('heater inventory follows tank owners and live stage and glow state',()=>{
  for(const type of ['schicht','trennblech','getrennt']) {
    const c=fixture(type),m=c._model,result=context.inspect(c,m);
    assert.equal(result.reason,'heater-geometry-inventory-only');assert.equal(result.heaters.length,2);
    const [upper,lower]=result.heaters;
    assert.equal(upper.parent,type==='getrennt'?'hot-tank':'tank');assert.equal(lower.parent,type==='getrennt'?'buffer-tank':'tank');
    assert.deepEqual(Array.from(upper.stages,x=>x.active),[true,true,false,false]);assert.ok(upper.glow);assert.equal(lower.glow,null);
    assert.equal(upper.texts[0].text,'Heater top');assert.equal(lower.texts[1].text,'0 W');
    c._hass.states['sensor.upper'].state='0';c._hass.states['sensor.lower'].state='1000';
    const changed=context.inspect(c,m);assert.equal(changed.heaters[0].glow,null);assert.ok(changed.heaters[1].glow);
    assert.deepEqual(Array.from(changed.heaters[0].stages,x=>x.active),[false,false,false,false]);
    const tank=m.components[lower.parent];tank.origin.x+=20;tank.origin.y+=10;
    const moved=context.inspect(c,m);assert.equal(moved.heaters[1].body.x,lower.body.x+20);assert.equal(moved.heaters[1].body.y,lower.body.y+10);
    assert.equal(moved.heaters[1].glow.x,changed.heaters[1].glow.x+20);
    assert.equal(moved.heaters[1].coil.d,changed.heaters[1].coil.d);
    assert.equal(moved.heaters[1].coil.dx,20);assert.equal(moved.heaters[1].coil.dy,10);
    assert.equal(moved.heaters[1].coil.x,changed.heaters[1].coil.x+20);
  }
});
test('heater geometry inventory rejects forged parentage, dimensions and stage count',()=>{
  const c=fixture('getrennt'),m=c._model,h=m.components['upper-heater'];
  h.parent='buffer-tank';assert.equal(context.inspect(c,m).reason,'heater-geometry-unproven');h.parent='hot-tank';
  h.bounds.width++;assert.equal(context.inspect(c,m).reason,'heater-geometry-unproven');h.bounds.width--;
  h.localOrigin.x++;assert.equal(context.inspect(c,m).reason,'heater-geometry-unproven');h.localOrigin.x--;
  m.geometry.heaterY++;assert.equal(context.inspect(c,m).reason,'heater-geometry-unproven');m.geometry.heaterY--;
  m.components['hot-tank'].baseOrigin.x++;assert.equal(context.inspect(c,m).reason,'heater-geometry-unproven');
  m.components['hot-tank'].baseOrigin.x--;c._cfg.hs_stufen=1000;assert.equal(context.inspect(c,m).reason,'heater-geometry-unproven');
});
test('rendered heater shapes and live text remain separately unapproved and reject tampering',()=>{
  const c=fixture('getrennt'),m=c._model;m.components['hot-tank'].origin.x+=20;m.components['hot-tank'].origin.y+=10;
  const inv=context.inspect(c,m),root={a:1,b:0,c:0,d:1,e:0,f:0},elements=[];
  for(const h of inv.heaters) {
    const {dx,dy}=h.texts[0],y=h.y-dy,color=h.on?c._cfg.farben.aktiv:'#b0b6bd';
    const node=(localName,attrs)=>({localName,attrs,style:{getPropertyValue:name=>name==='animation-duration'?'2.4s':''},getAttribute(k){return this.attrs[k]===undefined?null:String(this.attrs[k]);},closest:()=>null,getScreenCTM:()=>({...root,e:dx,f:dy})});
    elements.push(node('path',{d:h.coil.d,fill:'none',stroke:color,'stroke-width':'2.6','stroke-linecap':'round','stroke-linejoin':'round'}));
    elements.push(node('rect',{x:198,y:y-11,width:16,height:22,rx:3,fill:'#2b2f35',stroke:color,'stroke-width':'1.5'}));
    for(const [i,stage] of h.stages.entries())elements.push(node('rect',{x:Math.round((124+i*70/c._cfg.hs_stufen)*100)/100,y:y+11,width:stage.width,height:4,rx:1.5,fill:stage.active?c._cfg.farben.aktiv:'rgba(255,255,255,.3)'}));
    if(h.on)elements.push(node('ellipse',{cx:156,cy:y,rx:50,ry:13,fill:'url(#wwHeat)',class:'wb'}));
  }
  const svg={isConnected:true,querySelector:()=>gradient(c),ownerDocument:{defaultView:{getComputedStyle:el=>({filter:'none',clipPath:'none',mask:'none',markerStart:'none',markerMid:'none',markerEnd:'none',mixBlendMode:'normal',vectorEffect:'none',stroke:el.attrs.stroke??'none',strokeWidth:String(el.attrs['stroke-width']??'1'),strokeLinecap:'round',strokeLinejoin:'round',animationName:'wb',animationDuration:'2.4s',animationIterationCount:'infinite'})}},getScreenCTM:()=>root,querySelectorAll:()=>elements};
  assert.equal(context.shapes(c,m,svg).reason,'heater-svg-shapes-bound-only');
  const glow=elements.find(x=>x.localName==='ellipse');glow.attrs.rx=51;assert.equal(context.shapes(c,m,svg).reason,'heater-svg-unproven');glow.attrs.rx=50;
  const findGradient=svg.querySelector;svg.querySelector=()=>null;assert.equal(context.shapes(c,m,svg).reason,'heater-svg-unproven');svg.querySelector=findGradient;
  const coil=elements.find(x=>x.localName==='path');coil.attrs['stroke-width']='5';assert.equal(context.shapes(c,m,svg).reason,'heater-svg-unproven');coil.attrs['stroke-width']='2.6';
  const orig=coil.getScreenCTM;coil.getScreenCTM=()=>root;assert.equal(context.shapes(c,m,svg).reason,'heater-svg-unproven');coil.getScreenCTM=orig;
  const style=svg.ownerDocument.defaultView.getComputedStyle;svg.ownerDocument.defaultView.getComputedStyle=el=>({...style(el),strokeWidth:el===coil?'20px':style(el).strokeWidth});
  assert.equal(context.shapes(c,m,svg).reason,'heater-svg-unproven');svg.ownerDocument.defaultView.getComputedStyle=style;
  for(const key of ['strokeLinecap','strokeLinejoin']) {svg.ownerDocument.defaultView.getComputedStyle=el=>({...style(el),[key]:el===coil?'miter':style(el)[key]});
    assert.equal(context.shapes(c,m,svg).reason,'heater-svg-unproven');}svg.ownerDocument.defaultView.getComputedStyle=style;
  svg.ownerDocument.defaultView.getComputedStyle=el=>({...style(el),animationDuration:el===glow?'9s':style(el).animationDuration});
  assert.equal(context.shapes(c,m,svg).reason,'heater-svg-unproven');svg.ownerDocument.defaultView.getComputedStyle=style;
  const records=inv.heaters.flatMap(h=>h.texts.map(t=>({x:String(t.x),y:String(t.y),className:t.className,text:t.text,matrix:{...root,e:t.dx,f:t.dy},box:{x:t.x+t.dx-10,y:t.y+t.dy-5,width:10,height:5}})));
  assert.equal(context.texts(c,m,records).reason,'heater-text-inventory-only');records[0].text+='!';assert.equal(context.texts(c,m,records).reason,'heater-text-unproven');
});

test('heater inventory matches canonical renderer attributes and attached translation',()=>{
  for(const type of ['schicht','getrennt']) for(const state of ['0','2']) {
    const c=fixture(type),m=c._model;c._hass.states['sensor.upper'].state=state;
    const parent=m.components[type==='getrennt'?'hot-tank':'tank'];parent.origin.x+=20;parent.origin.y+=10;
    const inventory=context.inspect(c,m),html=context.renderHeaterProbe(c);
    for(const h of inventory.heaters) {
      assert.ok(html.includes(`<path d="${h.coil.d}" fill="none"`));
      assert.ok(html.includes(`<rect x="198" y="${h.body.y-h.texts[0].dy}" width="16" height="22"`));
      assert.ok(html.includes(`<text x="${h.texts[0].x}" y="${h.texts[0].y}"`));
      if(h.on)assert.ok(html.includes(`<ellipse cx="156" cy="${h.y-h.texts[0].dy}" rx="50" ry="13"`));
    }
    assert.ok(html.includes('transform="translate(20 10)"'));
  }
});

test('heater text clearance rejects slots, foreign text, tank contour and pipe contact',()=>{
  const c=new Card();c.setConfig({speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'},heizstab_oben:{leistung:'sensor.heater'}});
  c._hass={language:'en',states:{'sensor.heater':{state:'1200'}}};const m=c._model,inv=context.inspect(c,m),h=inv.heaters[0],root={a:1,b:0,c:0,d:1,e:0,f:0};
  const records=h.texts.map((t,i)=>({x:String(t.x),y:String(t.y),className:t.className,text:t.text,matrix:{...root,e:t.dx,f:t.dy},box:{x:170,y:h.y+(i===0?-24:14),width:15,height:6}}));
  const candidate={model:m,routes:{}};assert.equal(context.clearance(c,candidate,records).reason,'heater-text-clearance-bound-only');
  const oversized=records.map(r=>({...r,box:{...r.box}}));oversized[0].box.width=30;
  assert.equal(context.clearance(c,candidate,oversized).reason,'heater-text-slot-overflow');
  const extra=[...records,{box:{...records[0].box}}];assert.equal(context.clearance(c,candidate,extra).reason,'heater-text-obstacle-contact');
  const routed={...candidate,routes:{test:{points:[{x:175,y:h.y-30},{x:175,y:h.y-18}],crossings:[]}}};
  assert.equal(context.clearance(c,routed,records).status,'unsupported');
  assert.notEqual(context.clearance(c,routed,records).reason,'heater-text-clearance-bound-only');
});

test('heater paint clearance permits owning tank and rejects pipe and foreign device contact',()=>{
  const c=new Card();c.setConfig({speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'},heizstab_oben:{leistung:'sensor.heater'}});
  c._hass={language:'en',states:{'sensor.heater':{state:'1200'}}};const m=c._model,h=context.inspect(c,m).heaters[0],candidate={model:m,routes:{}};
  assert.equal(context.shapeClearance(c,candidate).reason,'heater-shape-clearance-bound-only');
  const routed={...candidate,routes:{test:{points:[{x:150,y:h.y-20},{x:150,y:h.y+20}],crossings:[]}}};
  assert.equal(context.shapeClearance(c,routed).reason,'heater-shape-obstacle-contact');
  m.components.intruder={origin:{x:145,y:h.y-4},bounds:{x:0,y:0,width:10,height:8},ports:{}};
  assert.equal(context.shapeClearance(c,candidate).reason,'heater-shape-obstacle-contact');
});
test('rendered heater SVG and measured label records match inventory for on and off states',()=>{
  for(const type of ['schicht','getrennt']) for(const state of ['0','3']) {
    const c=new Card();c.setConfig({speicher:{typ:type},fm:{pumpe:'sensor.fm'},hs_stufen:4,heizstab_oben:{stufe:'sensor.heater',temp:'sensor.temp'}});
    c._hass={language:'en',states:{'sensor.heater':{state},'sensor.temp':{state:'43'}}};const m=c._model;
    const tank=m.components[type==='getrennt'?'hot-tank':'tank'];tank.origin.x+=20;tank.origin.y+=10;
    const html=context.renderHeaterProbe(c),inv=context.inspect(c,m),heater=inv.heaters[0],{dx,dy}=heater.texts[0],root={a:1,b:0,c:0,d:1,e:0,f:0},nodes=[];
    for(const match of html.matchAll(/<(path|rect|ellipse)\b([^>]*)\/?\s*>/g)) {
      const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
      nodes.push({localName:match[1],attrs,getAttribute:name=>attrs[name]??null,closest:()=>null,
        style:{getPropertyValue:name=>name==='animation-duration'&&attrs.style?.includes('animation-duration:2.4s')?'2.4s':''},getScreenCTM:()=>({...root,e:dx,f:dy})});
    }
    const svg={isConnected:true,querySelector:()=>gradient(c),getScreenCTM:()=>root,querySelectorAll:()=>nodes,ownerDocument:{defaultView:{getComputedStyle:el=>({filter:'none',clipPath:'none',mask:'none',markerStart:'none',markerMid:'none',markerEnd:'none',mixBlendMode:'normal',vectorEffect:'none',stroke:el.attrs.stroke??'none',strokeWidth:el.attrs['stroke-width']??'1',strokeLinecap:'round',strokeLinejoin:'round',animationName:'wb',animationDuration:'2.4s',animationIterationCount:'infinite'})}}};
    assert.equal(context.shapes(c,m,svg).reason,'heater-svg-shapes-bound-only');
    const records=[...html.matchAll(/<text\s+([^>]*)>([^<]*)<\/text>/g)].map(match=>{const a=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));return {x:a.x,y:a.y,className:a.class??null,text:match[2],matrix:{...root,e:dx,f:dy},box:{x:Number(a.x)+dx-15,y:Number(a.y)+dy-8,width:12,height:6}}});
    assert.equal(context.texts(c,m,records).reason,'heater-text-inventory-only');
  }
});

test('FM and heater route experiment never enables the editor path',()=>{
  const c=new Card();c.setConfig({speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'},heizstab_oben:{leistung:'sensor.heater'}});
  c._hass={language:'en',states:{'sensor.heater':{state:'1200'}}};
  const result=context.routeProbe(c,{version:2,components:{fm:{x:370,y:29}}});
  assert.equal(result.status,'unsupported');assert.equal(result.reason,'heater-route-inventory-only');
  assert.equal(Object.keys(result.candidate.routes).length,2);
  assert.equal(context.routeProbe(c,{version:2,components:{fm:{x:340,y:14}}}).reason,'heater-route-unproven');
  assert.equal(context.routeProbe(c,{version:2,components:{fm:{x:100,y:100}}}).reason,'heater-body-collision');
});

test('FM heater complete shape experiment rejects extra ellipses and changed geometry',()=>{
  for(const state of ['0','2']) {
    const c=new Card();c.setConfig({speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'},hs_stufen:4,heizstab_oben:{stufe:'sensor.heater',temp:'sensor.temp'}});
    c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.heater':{state},'sensor.temp':{state:'43'}}};
    const result=context.routeProbe(c,{version:2,components:{fm:{x:370,y:29}}}),candidate=result.candidate;c._model=candidate.model;
    const html=c._render(),body=html.slice(html.indexOf('</defs>')+7,html.indexOf('</svg>')),root={a:1,b:0,c:0,d:1,e:0,f:0},nodes=[];
    for(const match of body.matchAll(/<(path|rect|circle|line|ellipse)\b([^>]*)\/?\s*>/g)) {
      const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]])),moved=attrs.d?.startsWith('M430 30C424');
      nodes.push({localName:match[1],attrs,getAttribute:name=>attrs[name]??null,closest:()=>null,style:{getPropertyValue:name=>name==='animation-duration'&&attrs.style?.includes('animation-duration:2.4s')?'2.4s':''},getScreenCTM:()=>moved?{...root,e:30,f:15}:root});
    }
    const svg={isConnected:true,querySelector:()=>gradient(c),getScreenCTM:()=>root,querySelectorAll:selector=>nodes.filter(n=>selector.split(',').includes(n.localName)),ownerDocument:{defaultView:{getComputedStyle:el=>({filter:'none',clipPath:'none',mask:'none',markerStart:'none',markerMid:'none',markerEnd:'none',mixBlendMode:'normal',vectorEffect:'none',stroke:el.attrs.stroke??'none',strokeWidth:el.attrs['stroke-width']??'1',strokeLinecap:'round',strokeLinejoin:'round',animationName:'wb',animationDuration:'2.4s',animationIterationCount:'infinite'})}}};
    assert.equal(context.complete(c,candidate,svg).status,'complete',state);
    nodes.push({localName:'ellipse',closest:()=>null,getAttribute:()=>null});assert.equal(context.complete(c,candidate,svg).status,'unsupported');nodes.pop();
    const coil=nodes.find(n=>n.attrs['stroke-width']==='2.6');coil.attrs['stroke-width']='5';assert.equal(context.complete(c,candidate,svg).status,'unsupported');
  }
});
test('heater and air-WP route experiment preserves seven routed connections',()=>{
  for(const type of ['schicht','trennblech']) {
    const c=new Card();c.setConfig({speicher:{typ:type},fm:{pumpe:'sensor.fm'},wp:{typ:'luft',betrieb:'sensor.wp',ventil:'sensor.valve'},heizstab_oben:{stufe:'sensor.heater'}});
    c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:'on'},'sensor.valve':{state:'on'},'sensor.heater':{state:'2'}}};
    const result=context.routeProbe(c,{version:2,components:{fm:{x:370,y:29}}});
    assert.equal(result.reason,'heater-route-inventory-only',JSON.stringify(result));assert.equal(Object.keys(result.candidate.routes).length,7);
    assert.ok(Object.values(result.candidate.routes).every(r=>r.status==='routed'));
    const moved=context.routeProbe(c,{version:2,components:{fm:{x:370,y:29},wp:{x:330,y:140}}});
    assert.equal(moved.reason,'heater-route-inventory-only',JSON.stringify(moved));
    assert.equal(context.routeProbe(c,{version:2,components:{fm:{x:100,y:100}}}).status,'unsupported');
    for(const heaters of [{heizstab_unten:{stufe:'sensor.heater'}},{heizstab_oben:{stufe:'sensor.heater'},heizstab_unten:{stufe:'sensor.heater'}}]) {
      const other=new Card();other.setConfig({speicher:{typ:type},fm:{pumpe:'sensor.fm'},wp:{typ:'luft',betrieb:'sensor.wp',ventil:'sensor.valve'},...heaters});other._hass=c._hass;
      assert.equal(context.routeProbe(other,{version:2,components:{fm:{x:370,y:29},wp:{x:330,y:140}}}).reason,'heater-route-inventory-only');
    }
  }
});
test('heater layout retains inactive WP placement and ports across disable and restore',()=>{
  const layout={version:2,components:{fm:{x:370,y:29},wp:{x:330,y:140}},ports:{'wp.upper-supply':{mode:'auto'}}},before=JSON.stringify(layout);
  for(const wp of [true,false,true]) {
    const c=new Card();c.setConfig({speicher:{typ:'schicht'},fm:{pumpe:'sensor.fm'},heizstab_oben:{stufe:'sensor.heater'},...(wp?{wp:{betrieb:'sensor.wp',ventil:'sensor.valve'}}:{})});
    c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:'on'},'sensor.valve':{state:'50'},'sensor.heater':{state:'2'}}};
    const result=context.routeProbe(c,layout);assert.equal(result.reason,'heater-route-inventory-only',JSON.stringify(result));
    assert.equal(result.candidate.model.components.fm.origin.x,370);
    if(wp)assert.equal(result.candidate.model.components.wp.origin.y,140);
    else {assert.ok(result.candidate.inactive.some(x=>x.path==='layout.components.wp'));assert.ok(result.candidate.inactive.some(x=>x.path==='layout.ports.wp.upper-supply'));}
    assert.equal(JSON.stringify(layout),before);
  }
});
test('separated tanks with heaters route the actual heater-adjusted geometry',()=>{
  for(const heaters of [{heizstab_oben:{stufe:'sensor.heater'}},{heizstab_unten:{stufe:'sensor.heater'}},{heizstab_oben:{stufe:'sensor.heater'},heizstab_unten:{stufe:'sensor.heater'}}]) {
    const c=new Card();c.setConfig({speicher:{typ:'getrennt'},fm:{pumpe:'sensor.fm'},...heaters});
    c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.heater':{state:'2'}}};
    const layout={version:2,components:{fm:{x:-110,y:14}},ports:{'tank.fm-supply':{mode:'auto'},'fm.supply':{mode:'auto'}}};
    const result=context.routeProbe(c,layout);assert.equal(result.reason,'heater-route-inventory-only',JSON.stringify(result));
    assert.equal(Object.keys(result.candidate.routes).length,2);
    assert.equal(result.candidate.model.geometry.ro,c._model.geometry.ro);
    const moved=context.routeProbe(c,{...layout,components:{...layout.components,tank:{x:80,y:14}}});assert.equal(moved.reason,'heater-tank-movement-unproven');
  }
});
test('separated heaters and WP route full actual seven-line model',()=>{
  const c=new Card();c.setConfig({speicher:{typ:'getrennt'},fm:{pumpe:'sensor.fm'},wp:{betrieb:'sensor.wp',ventil:'sensor.valve'},heizstab_oben:{stufe:'sensor.heater'}});
  c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.heater':{state:'2'},'sensor.wp':{state:'on'},'sensor.valve':{state:'50'}}};
  const layout={version:2,components:{fm:{x:-110,y:14}},ports:{'tank.fm-supply':{mode:'auto'},'fm.supply':{mode:'auto'}}};
  const result=context.routeProbe(c,layout);assert.equal(result.reason,'heater-route-inventory-only',JSON.stringify(result));
  assert.equal(Object.keys(result.candidate.routes).length,7);
  for(const extra of [{wp:{x:330,y:140}},{valve:{rotation:90}}]) {
    const changed=context.routeProbe(c,{...layout,components:{...layout.components,...extra}});
    assert.notEqual(changed.reason,'heater-route-inventory-only');assert.equal(changed.status,'unsupported');
  }
  for(const heaters of [{heizstab_unten:{stufe:'sensor.heater'}},{heizstab_oben:{stufe:'sensor.heater'},heizstab_unten:{stufe:'sensor.heater'}}]) {
    const other=new Card();other.setConfig({speicher:{typ:'getrennt'},fm:{pumpe:'sensor.fm'},wp:{betrieb:'sensor.wp',ventil:'sensor.valve'},...heaters});other._hass=c._hass;
    assert.equal(context.routeProbe(other,layout).reason,'heater-route-inventory-only');
  }
});
test('separated heater keeps dormant WP overrides during disable and restore',()=>{
  const layout={version:2,components:{fm:{x:-110,y:14},wp:{x:330,y:150}},ports:{'tank.fm-supply':{mode:'auto'},'fm.supply':{mode:'auto'},'wp.upper-supply':{mode:'auto'}}},before=JSON.stringify(layout);
  for(const active of [true,false,true]) {
    const c=new Card();c.setConfig({speicher:{typ:'getrennt'},fm:{pumpe:'sensor.fm'},heizstab_oben:{stufe:'sensor.heater'},...(active?{wp:{betrieb:'sensor.wp',ventil:'sensor.valve'}}:{})});
    c._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.heater':{state:'2'},'sensor.wp':{state:'on'},'sensor.valve':{state:'50'}}};
    const result=context.routeProbe(c,layout);assert.equal(result.reason,'heater-route-inventory-only',JSON.stringify(result));
    if(!active)assert.ok(result.candidate.inactive.some(item=>item.path==='layout.components.wp'));
    else assert.equal(result.candidate.model.components.wp.origin.x,330);
    assert.equal(JSON.stringify(layout),before);
  }
});
test('small separated tank heater adjusts WP inlet geometry before routing',()=>{
  const config={speicher:{typ:'getrennt',trennung:35},fm:{pumpe:'sensor.fm'},wp:{betrieb:'sensor.wp'},heizstab_oben:{stufe:'sensor.heater'}};
  const card=new Card();card.setConfig(config);card._hass={language:'en',states:{'sensor.fm':{state:'on'},'sensor.wp':{state:'on'},'sensor.heater':{state:'2'}}};
  const noHeater=new Card();noHeater.setConfig({...config,heizstab_oben:null});
  assert.notEqual(card._model.geometry.ro,noHeater._model.geometry.ro);
  const result=context.routeProbe(card,{version:2,components:{fm:{x:-110,y:14}},ports:{'tank.fm-supply':{mode:'auto'},'fm.supply':{mode:'auto'}}});
  assert.equal(result.status,'unsupported');
  if(result.reason==='heater-route-inventory-only')assert.equal(result.candidate.model.geometry.ro,card._model.geometry.ro);
});
