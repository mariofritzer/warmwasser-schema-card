const {test} = require('node:test');
const assert = require('node:assert/strict');
const {card,routeDirectedJunctionConnection,validateDirectedFixedPolyline,compileDirectedJunctionBatch,resolveLegacyWpHeatingIncidences,inspectCompleteLegacyWpHeatingBatch,prepareLegacyWpHeatingRails,checkLegacyHeatingModelBodies,renderLegacyWpHeatingBatchPreview:preview,planLegacyWpHeatingAnimations:plan,deriveLegacyWpHeatingAnimationState:derive,reverseCompiledAnimationPath:reverse}=require('./helpers/routing-harness.cjs');

test('nine-line batch with canonical primary return', () => {
  const c=card('schicht',{fm:null,wp:{betrieb:'sensor.wp',ventil:'sensor.valve'},heizkreise:[{vorlauf:'sensor.vl'}]}),m=c._model;
  const state=(wp,valve,pump)=>{c._hass.states={'sensor.wp':{state:wp,attributes:{}},'sensor.valve':{state:valve,attributes:{}},'switch.hk':{state:pump,attributes:{}}};return derive(c);};
  const incidence=resolveLegacyWpHeatingIncidences(m);
  const policy={radius:4};
  const resolve=ref=>{const j=m.junctions[ref]; if(j)return {...j,ref}; const [id,name]=ref.split('.'),c=m.components[id],p=c.ports[name];return {...p,x:c.origin.x+p.x,y:c.origin.y+p.y,ref,owner:id};};
  const side=(ref,id,index)=>incidence.junctions.find(j=>j.ref===ref).incidences.find(i=>i.connectionId===id&&i.segmentIndex===index).side;
  const routes=[];
  for (const [id,edge] of Object.entries(m.connections)) {
    if (id.startsWith('manifold-')) continue;
    const nodes=[edge.from,...edge.via,edge.to].map(resolve), from={...nodes[0]},to={...nodes.at(-1)};
    if(m.junctions[from.ref])from.direction=side(from.ref,id,0);
    if(m.junctions[to.ref])to.direction=side(to.ref,id,nodes.length-2);
    const junctions=nodes.slice(1,-1).map((n,i)=>({...n,incomingSide:side(n.ref,id,i),outgoingSide:side(n.ref,id,i+1)}));
    const role=id.includes('supply')?'supply':'neutral';
    const r=id==='hk-return'
      ? validateDirectedFixedPolyline({id,role,nodes,points:[{x:312,y:448},{x:312,y:370},{x:240,y:370},{x:240,y:340}]},policy)
      : routeDirectedJunctionConnection({id,role,from,to,junctions,lead:12,clearance:13,compileOptions:policy});
    assert.equal(r.status,'routed',`${id}: ${r.code}`);
    routes.push(r);
  }
  const result=compileDirectedJunctionBatch(routes,policy);
  assert.equal(result.status,'routed',JSON.stringify(result));
  const complete=inspectCompleteLegacyWpHeatingBatch(m,routes,policy);
  assert.equal(complete.reason,'heating-decorations-and-paint-validation-required',JSON.stringify(complete));
  const flow=Object.fromEntries([...routes.map(r=>r.id),'manifold-return','manifold-supply'].map(id=>[id,true]));
  const colours={supply:'#ff0000',return:'#0000ff'},mode='synthetic-full-route';
  assert.equal(preview(m,routes,policy,flow,colours).reason,'synthetic-preview-opt-in-required');
  const drawn=preview(m,routes,policy,flow,colours,mode);
  assert.equal(drawn.reason,'synthetic-preview-not-operational-animation',JSON.stringify(drawn));
  assert.ok(drawn.paintOrder.indexOf('manifold-return')>drawn.paintOrder.indexOf('heating-return-0'));
  assert.ok(drawn.paintOrder.indexOf('manifold-return')<drawn.paintOrder.indexOf('heating-supply-0'));
  assert.ok(drawn.paintOrder.indexOf('manifold-supply')>drawn.paintOrder.indexOf('heating-supply-0'));
  for (const id of routes.map(r=>r.id)) {
    const group=drawn.fragment.match(new RegExp(`<g data-preview-route="${id}">([\\s\\S]*?)</g>`))[1];
    const layers=[...group.matchAll(/<path d="([^"]+)" class="w[0-3]"/g)];
    assert.equal(layers.length,4,id); assert.equal(new Set(layers.map(p=>p[1])).size,1,id);
    if(id==='heating-supply-0') assert.ok(layers[0][1].includes('A11 11 0 0 1'));
    else assert.equal(layers[0][1],result.routes[id].path,id);
  }
  assert.ok(drawn.fragment.includes('M295 420H154" class="w3"'));
  assert.ok(drawn.fragment.includes('M186 448H312" class="w3"'));
  assert.equal(preview(m,routes.slice(1),policy,flow,colours,mode).reason,'incomplete-heating-batch');
  assert.equal(preview(m,routes,policy,flow,{supply:'url(https://example.test)',return:'#0000ff'},mode).reason,'invalid-preview-colour');
  const muted={...flow,'hk-return':false};
  assert.equal((preview(m,routes,policy,muted,colours,mode).fragment.match(/data-preview-route="hk-return">([\s\S]*?)<\/g>/)[1].match(/class="w3"/g)||[]).length,0);
  const upper=state('on','100','on'), upperPlan=plan(m,routes,policy,upper);
  assert.equal(upperPlan.reason,'animation-plan-paint-validation-required');
  assert.equal(upperPlan.plan['wp-lower-supply'],null);
  assert.equal(upperPlan.plan['wp-lower-return'],null);
  assert.equal(reverse('M295 213L268 213A6 6 0 0 1 256 213L206 213'),'M206 213L256 213A6 6 0 0 0 268 213L295 213');
  assert.equal(reverse('M206 340L240 340'),'M240 340L206 340');
  assert.equal(reverse('M0 0L2 0Q4 0 4 2'),'M4 2Q4 0 2 0L0 0');
  assert.equal(reverse('M0 0C1 2 3 4 5 6'),null);
  const livePreview=preview(m,routes,policy,upper,colours,'operational-preview');
  assert.equal(livePreview.reason,'operational-preview-paint-and-decoration-unvalidated');
  const lowerGroup=livePreview.fragment.match(/data-preview-route="wp-lower-supply">([\s\S]*?)<\/g>/)[1];
  assert.ok(!lowerGroup.includes('class="w3"'));
  const lower=plan(m,routes,policy,state('on','0','off'));
  assert.equal(lower.plan['wp-lower-supply'].path,result.routes['wp-lower-supply'].path);
  assert.equal(lower.plan['wp-upper-supply'],null); assert.equal(lower.plan['hk-supply'],null);
  const splitState=state('on','25','on'),split=plan(m,routes,policy,splitState);
  assert.equal(split.plan['wp-upper-supply'].duration,4);
  assert.ok(Math.abs(split.plan['wp-lower-supply'].duration-4/3)<1e-12);
  assert.ok(preview(m,routes,policy,splitState,colours,'operational-preview').fragment.includes('animation-duration:1.33s'));
  const boundaryLow=plan(m,routes,policy,state('on','4','off'));
  assert.equal(boundaryLow.plan['wp-upper-supply'],null);
  const boundaryHigh=plan(m,routes,policy,state('on','96','off'));
  assert.equal(boundaryHigh.plan['wp-lower-supply'],null);
  c._cfg.wp.ventil_invertieren=true;
  const inverted=plan(m,routes,policy,state('on','100','off'));
  assert.equal(inverted.plan['wp-upper-supply'],null);
  assert.ok(inverted.plan['wp-lower-supply']);
  c._cfg.wp.ventil_invertieren=false;
  const off=plan(m,routes,policy,state('off','unavailable','off'));
  assert.ok(Object.values(off.plan).every(x=>x===null));
  assert.equal(plan(m,routes,policy,{wpOn:true,valveFraction:2,circuitOn:true}).reason,'animation-state-unsupported');
  assert.equal(plan(m,routes,policy,upper).reason,'animation-state-unsupported','stale HA state must not be reused');
  const pumpCard=card('schicht',{fm:null,wp:{betrieb:'sensor.wp'},heizkreise:[{pumpe:'switch.hk'}]});
  assert.equal(derive(pumpCard).circuitOn,false,'configured pump state is read from HA');
  c._cfg.heizkreise[0].pumpe='switch.hk';
  assert.equal(derive(c).reason,'animation-state-unsupported','configuration must match model pump topology');
  delete c._cfg.heizkreise[0].pumpe;
  const tankShadow=complete.shadows.find(s=>s.id==='tank');
  assert.deepEqual([tankShadow.x,tankShadow.y,tankShadow.width,tankShadow.height],[33,-94,208,576]);
  assert.ok(complete.shadowContacts.some(c=>c.connections.length>0));
  assert.ok(complete.unmeasuredText.includes('wp-status-and-readings'));
  assert.ok(complete.unresolved.includes('paint-order-and-animation'));
  const feet=m.components['tank-feet'], original={...feet.bounds};
  // Only the corner of the A11 envelope touches this point obstacle.
  Object.assign(feet.bounds,{x:138-feet.origin.x,y:464-feet.origin.y,width:0,height:0});
  assert.equal(inspectCompleteLegacyWpHeatingBatch(m,routes,policy).reason,'model-body-bridge-contact');
  // Only the corner of the ordinary A6 bridge at (295,370) touches it.
  Object.assign(feet.bounds,{x:284-feet.origin.x,y:359-feet.origin.y,width:0,height:0});
  assert.equal(inspectCompleteLegacyWpHeatingBatch(m,routes,policy).reason,'model-body-bridge-contact');
  Object.assign(feet.bounds,original);
  const port=m.components.wp.ports['upper-supply'], portY=port.y;
  port.y=10;
  assert.equal(inspectCompleteLegacyWpHeatingBatch(m,routes,policy).reason,'route-model-mismatch');
  port.y=10.01;
  assert.equal(inspectCompleteLegacyWpHeatingBatch(m,routes,policy).reason,'unproven-port-geometry');
  port.y=portY;
  const prepared=prepareLegacyWpHeatingRails(m,policy);
  const returnToOwner={id:'wp-upper-supply',points:[{x:350,y:146},{x:350,y:120},{x:360,y:120},{x:360,y:180}]};
  const bodyResult=checkLegacyHeatingModelBodies(m,prepared,[returnToOwner],{routes:{}},complete.localBridge,policy);
  assert.equal(bodyResult.reason,'model-body-line-contact');
  assert.equal(bodyResult.bodyId,'wp');
  assert.equal(bodyResult.segment,2);
  // A different WP port's stub is an obstacle even on this route's first leg.
  const foreignStub={id:'wp-lower-supply',points:[{x:330,y:140},{x:370,y:140}]};
  assert.equal(checkLegacyHeatingModelBodies(m,prepared,[foreignStub],{routes:{}},complete.localBridge,policy).reason,'model-stub-line-contact');
  // Both strokes clear the WP body and its upper stub; only the A6 envelope
  // around their crossing reaches the stub's 0.4px stroke at y=141.6.
  const make=(id,a,b)=>validateDirectedFixedPolyline({id,points:[a,b],nodes:[{ref:id+'-a',...a},{ref:id+'-b',...b}]},policy);
  const h=make('hk-supply',{x:342,y:131},{x:382,y:131});
  const v=make('hk-return',{x:362,y:111},{x:362,y:143});
  for (const route of [h,v]) {
    const single=compileDirectedJunctionBatch([route],policy);
    assert.equal(single.status,'routed');
    assert.equal(checkLegacyHeatingModelBodies(m,prepared,[route],single,complete.localBridge,policy).status,'clear');
  }
  const crossing=compileDirectedJunctionBatch([h,v],policy);
  assert.equal(crossing.status,'routed');
  assert.equal(checkLegacyHeatingModelBodies(m,prepared,[h,v],crossing,complete.localBridge,policy).reason,'model-body-bridge-contact');
  const stub=m.components.wp.ports['upper-supply'].stub;
  stub.width++;
  assert.equal(inspectCompleteLegacyWpHeatingBatch(m,routes,policy).reason,'invalid-model-stub');
  stub.width--;
  m.components['tank-feet'].bounds.x=107;
  m.components['tank-feet'].bounds.y=-22;
  m.components['tank-feet'].bounds.width=150;
  assert.equal(inspectCompleteLegacyWpHeatingBatch(m,routes,policy).reason,'model-body-line-contact');
});

test('one pump joins the complete batch but animation remains fail-closed',()=>{
  const c=card('schicht',{fm:null,wp:{betrieb:'sensor.wp'},heizkreise:[{pumpe:'switch.hk'}]}),m=c._model,policy={radius:4};
  c._hass.states={'sensor.wp':{state:'on',attributes:{}},'switch.hk':{state:'on',attributes:{}}};
  const incidence=resolveLegacyWpHeatingIncidences(m);
  assert.equal(incidence.status,'resolved');
  const resolve=ref=>{const j=m.junctions[ref];if(j)return {...j,ref};const [id,name]=ref.split('.'),b=m.components[id],p=b.ports[name];return {...p,x:b.origin.x+p.x,y:b.origin.y+p.y,ref,owner:id};};
  const side=(ref,id,index)=>incidence.junctions.find(j=>j.ref===ref).incidences.find(i=>i.connectionId===id&&i.segmentIndex===index).side;
  const routes=[];
  for(const [id,edge] of Object.entries(m.connections)) {
    if(id.startsWith('manifold-'))continue;
    const nodes=[edge.from,...edge.via,edge.to].map(resolve),from={...nodes[0]},to={...nodes.at(-1)};
    if(m.junctions[from.ref])from.direction=side(from.ref,id,0);
    if(m.junctions[to.ref])to.direction=side(to.ref,id,nodes.length-2);
    const junctions=nodes.slice(1,-1).map((n,i)=>({...n,incomingSide:side(n.ref,id,i),outgoingSide:side(n.ref,id,i+1)}));
    const role=id.includes('supply')||id.startsWith('heating-pump-')?'supply':'neutral';
    const points=id==='hk-return'?[{x:312,y:448},{x:312,y:370},{x:240,y:370},{x:240,y:340}]
      :id.startsWith('heating-pump-')?nodes.map(({x,y})=>({x,y})):null;
    const route=points?validateDirectedFixedPolyline({id,role,nodes,points},policy)
      :routeDirectedJunctionConnection({id,role,from,to,junctions,lead:12,clearance:13,compileOptions:policy});
    assert.equal(route.status,'routed',`${id}: ${route.reason}`);routes.push(route);
  }
  assert.equal(routes.length,11);
  const inspected=inspectCompleteLegacyWpHeatingBatch(m,routes,policy);
  assert.equal(inspected.reason,'heating-decorations-and-paint-validation-required',JSON.stringify(inspected));
  const actual=derive(c);
  assert.equal(actual.circuitOn,true);
  assert.equal(plan(m,routes,policy,actual).reason,'pump-animation-phase-unproven');
  assert.equal(inspectCompleteLegacyWpHeatingBatch(m,routes.filter(r=>r.id!=='heating-pump-out-0'),policy).reason,'incomplete-heating-batch');
  const prepared=prepareLegacyWpHeatingRails(m,policy);
  const intruder={id:'hk-return',points:[{x:125,y:514},{x:180,y:514}]};
  const halo=checkLegacyHeatingModelBodies(m,prepared,[intruder],{routes:{}},inspected.localBridge,policy);
  assert.equal(halo.reason,'model-body-line-contact'); assert.equal(halo.bodyId,'heating-pump-0');
  m.connections['heating-pump-through-0'].to='heating-circuit-0.return';
  assert.equal(resolveLegacyWpHeatingIncidences(m).status,'unsupported');
});
