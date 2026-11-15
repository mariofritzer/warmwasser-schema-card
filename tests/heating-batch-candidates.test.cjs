const {test} = require('node:test');
const assert = require('node:assert/strict');
const {card,routeDirectedJunctionConnection,validateDirectedFixedPolyline,compileDirectedJunctionBatch,resolveLegacyWpHeatingIncidences,inspectCompleteLegacyWpHeatingBatch}=require('./helpers/routing-harness.cjs');

test('nine-line batch with canonical primary return', () => {
  const m=card('schicht',{fm:null,wp:{betrieb:'sensor.wp'},heizkreise:[{vorlauf:'sensor.vl'}]})._model;
  const incidence=resolveLegacyWpHeatingIncidences(m);
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
      ? validateDirectedFixedPolyline({id,role,nodes,points:[{x:312,y:448},{x:312,y:390},{x:340,y:390},{x:340,y:370},{x:240,y:370},{x:240,y:340}]})
      : routeDirectedJunctionConnection({id,role,from,to,junctions,lead:12,clearance:13});
    assert.equal(r.status,'routed',`${id}: ${r.code}`);
    routes.push(r);
  }
  const result=compileDirectedJunctionBatch(routes);
  assert.equal(result.status,'routed',JSON.stringify(result));
  const complete=inspectCompleteLegacyWpHeatingBatch(m,routes);
  assert.equal(complete.reason,'heating-obstacle-and-paint-validation-required',JSON.stringify(complete));
});
