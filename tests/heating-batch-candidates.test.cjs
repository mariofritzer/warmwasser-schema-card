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
  m.components['tank-feet'].bounds.x=107;
  m.components['tank-feet'].bounds.y=-22;
  m.components['tank-feet'].bounds.width=150;
  assert.equal(inspectCompleteLegacyWpHeatingBatch(m,routes,policy).reason,'model-body-line-contact');
});
