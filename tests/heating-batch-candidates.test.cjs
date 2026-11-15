const {test} = require('node:test');
const assert = require('node:assert/strict');
const {card,routeDirectedJunctionConnection,validateDirectedFixedPolyline,compileDirectedJunctionBatch,resolveLegacyWpHeatingIncidences,inspectCompleteLegacyWpHeatingBatch,prepareLegacyWpHeatingRails,checkLegacyHeatingModelBodies}=require('./helpers/routing-harness.cjs');

test('nine-line batch with canonical primary return', () => {
  const m=card('schicht',{fm:null,wp:{betrieb:'sensor.wp'},heizkreise:[{vorlauf:'sensor.vl'}]})._model;
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
